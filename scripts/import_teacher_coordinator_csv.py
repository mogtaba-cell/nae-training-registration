"""Refresh the private school-person roster from the supplied teacher/coordinator CSV.

Usage:
    python scripts/import_teacher_coordinator_csv.py "/path/to/allteachersschoolcoordinators.csv"

Behavior:
- Existing school identity, Arabic name, type, region, and registered pathways are preserved.
- Teacher rosters are replaced by the usable rows in the supplied CSV.
- Rows explicitly marked School Coordinator refresh that school's coordinator details.
  Existing verified status and unsupplied coordinator-only fields are preserved only
  when the coordinator still matches the same person.
- Valid schools in the CSV that are not yet in the directory are added with no
  registered school pathways. Arabic school names are never invented.
- Manually approved schools 9105 and 500AD are retained even when they have no people yet.
- Obvious blank/test rows are ignored and recorded in the report.
"""
from __future__ import annotations

from pathlib import Path
import argparse
import csv
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "registration-data.json"
SCHOOL_NAMES_PATH = ROOT / "data" / "school-names-bilingual.csv"
REPORT_PATH = ROOT / "data" / "teacher-data-update-report.json"

PATHWAYS = ["Literary Arts", "Performing Arts", "Visual Arts", "Digital Arts", "Applied Arts"]
TYPE_AR = {"Public": "حكومية", "Private": "خاصة", "Charter": "شراكات", "POD": "أصحاب الهمم"}
REGION_AR = {"Abu Dhabi": "أبوظبي", "Al Ain": "العين", "Al Dhafra": "الظفرة"}
MANUAL_SCHOOLS = [
    {
        "schoolEsis": "9105",
        "schoolName": "Emirates National Schools - Mbz",
        "schoolNameArabic": "مدرسة الإمارات الوطنية - محمد بن زايد",
        # Other Emirates National Schools campuses in the supplied school master
        # are Private; this classification is used only as school metadata/routing
        # does not depend on it.
        "schoolType": "Private",
        "schoolTypeArabic": "خاصة",
        "region": "Abu Dhabi",
        "regionArabic": "أبوظبي",
        "registeredPathways": [],
        "coordinator": {
            "nameEnglish": "", "nameArabic": "", "esis": "", "position": "",
            "emiratesId": "", "workEmail": "", "primaryEmail": "", "mobile": "",
            "verified": False,
        },
        "teachers": [],
    },
    {
        "schoolEsis": "500AD",
        "schoolName": "Um Kolthoom Girls School",
        "schoolNameArabic": "مدرسة أم كلثوم بنات",
        "schoolType": "Public",
        "schoolTypeArabic": "حكومية",
        "region": "Al Ain",
        "regionArabic": "العين",
        "registeredPathways": [],
        "coordinator": {
            "nameEnglish": "", "nameArabic": "", "esis": "", "position": "",
            "emiratesId": "", "workEmail": "", "primaryEmail": "", "mobile": "",
            "verified": False,
        },
        "teachers": [],
    }
]


def text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def raw_text(value: object) -> str:
    return str(value or "").strip()


def clean_optional(value: object) -> str:
    value = text(value)
    if value.casefold() in {"0", "n/a", "na", "none", "null", "-"}:
        return ""
    return value


def proper_name(value: object) -> str:
    value = text(value)
    if not value:
        return ""
    # Python's Unicode title-casing fixes all-caps/lowercase source names while
    # leaving Arabic letters intact. Restore common Roman-numeral suffixes.
    out = value.title()
    out = re.sub(r"\b(Ii|Iii|Iv|Vi|Vii|Viii)\b", lambda m: m.group(0).upper(), out)
    return out


def phone(value: object) -> str:
    raw = raw_text(value)
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 9 and digits.startswith("5"):
        return "0" + digits
    return raw


def parse_roles(value: object) -> list[str]:
    parts = [text(v) for v in re.split(r"[\r\n]+", raw_text(value))]
    return [v for i, v in enumerate(parts) if v and v not in parts[:i]]


def parse_session_pathways(value: object, unknown: set[str]) -> list[str]:
    found: list[str] = []
    for item in re.split(r"[,;]", raw_text(value)):
        item = text(item)
        if not item:
            continue
        if item not in PATHWAYS:
            unknown.add(item)
            continue
        if item not in found:
            found.append(item)
    return [p for p in PATHWAYS if p in found]


def specialization(value: object, unknown: set[str]) -> str:
    item = text(value)
    if not item:
        return ""
    if item not in PATHWAYS:
        unknown.add(item)
        return ""
    return item


def person_identity(row: dict[str, str]) -> str:
    # Preserve the source identifier exactly enough to keep records such as
    # PASS160870 and "Pass 160870" distinct; the live validator still catches
    # conflicting normalized IDs if both are selected in one request.
    esis = raw_text(row.get("Teacher eSIS"))
    if esis:
        return esis.casefold()
    return (raw_text(row.get("Email")).casefold() + "|" + raw_text(row.get("Full Name")).casefold())


def same_person(old: dict, row: dict[str, str]) -> bool:
    old_email = text(old.get("workEmail")).casefold()
    row_email = text(row.get("Email")).casefold()
    if old_email and row_email and old_email == row_email:
        return True
    old_esis = re.sub(r"\s+", "", text(old.get("esis"))).casefold()
    row_esis = re.sub(r"\s+", "", text(row.get("Teacher eSIS"))).casefold()
    if old_esis and row_esis and old_esis == row_esis:
        return True
    return proper_name(old.get("nameEnglish")).casefold() == proper_name(row.get("Full Name")).casefold()


def empty_coordinator() -> dict:
    return {
        "nameEnglish": "", "nameArabic": "", "esis": "", "position": "",
        "emiratesId": "", "workEmail": "", "primaryEmail": "", "mobile": "",
        "verified": False,
    }


def make_new_school(row: dict[str, str]) -> dict:
    school_type = text(row.get("Type"))
    region = text(row.get("Region"))
    return {
        "schoolEsis": text(row.get("eSIS_School")),
        "schoolName": text(row.get("School Name")),
        "schoolType": school_type,
        "region": region,
        "registeredPathways": [],
        "coordinator": empty_coordinator(),
        "teachers": [],
        "schoolNameArabic": "",
        "schoolTypeArabic": TYPE_AR.get(school_type, ""),
        "regionArabic": REGION_AR.get(region, ""),
    }


def valid_school_row(row: dict[str, str]) -> bool:
    esis = text(row.get("eSIS_School"))
    name = text(row.get("School Name"))
    if not esis or not name:
        return False
    if esis.casefold() == "test" or name.casefold() == "test school":
        return False
    if text(row.get("Region")) not in REGION_AR:
        return False
    if text(row.get("Type")) not in TYPE_AR:
        return False
    return True


def update_school_names_csv(schools: list[dict]) -> None:
    existing_order: list[str] = []
    if SCHOOL_NAMES_PATH.exists():
        with SCHOOL_NAMES_PATH.open("r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                esis = text(row.get("eSIS_School"))
                if esis and esis not in existing_order:
                    existing_order.append(esis)
    by_id = {s["schoolEsis"]: s for s in schools}
    extra_ids = [s["schoolEsis"] for s in schools if s["schoolEsis"] not in existing_order]
    order = [e for e in existing_order if e in by_id] + sorted(extra_ids, key=lambda e: by_id[e]["schoolName"].casefold())
    with SCHOOL_NAMES_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["eSIS_School", "School Name", "School Name Ar", "School Type", "School Type Ar", "Region", "Region Ar"])
        for esis in order:
            s = by_id[esis]
            writer.writerow([
                s["schoolEsis"], s["schoolName"], s.get("schoolNameArabic", ""),
                s.get("schoolType", ""), s.get("schoolTypeArabic", ""),
                s.get("region", ""), s.get("regionArabic", ""),
            ])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_file")
    args = parser.parse_args()
    source = Path(args.csv_file)

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    schools = {s["schoolEsis"]: s for s in data["schools"]}
    preexisting_ids = set(schools)
    preexisting_teachers = sum(len(s.get("teachers", [])) for s in schools.values())

    # The new CSV is authoritative for teacher roster membership.
    for s in schools.values():
        s["teachers"] = []

    rows: list[dict[str, str]] = []
    with source.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = [{k: raw_text(v) for k, v in row.items()} for row in reader]

    excluded: list[dict[str, str]] = []
    unknown_pathways: set[str] = set()
    new_from_csv: set[str] = set()
    coordinator_rows: dict[str, dict[str, str]] = {}
    seen_teacher_keys: set[tuple[str, str]] = set()

    for row_number, row in enumerate(rows, start=2):
        if not valid_school_row(row):
            excluded.append({
                "row": row_number,
                "schoolEsis": text(row.get("eSIS_School")),
                "schoolName": text(row.get("School Name")),
                "name": proper_name(row.get("Full Name")),
                "reason": "blank/test/unsupported school metadata",
            })
            continue

        school_id = text(row.get("eSIS_School"))
        if school_id not in schools:
            schools[school_id] = make_new_school(row)
            new_from_csv.add(school_id)
        school = schools[school_id]

        ident = person_identity(row)
        key = (school_id.casefold(), ident)
        if key in seen_teacher_keys:
            # This should be unusual; merge session pathways if a future export has
            # repeated person rows instead of adding duplicate roster cards.
            target = next(t for t in school["teachers"] if t.get("_sourceIdentity") == ident)
            for p in parse_session_pathways(row.get("Session Pathway"), unknown_pathways):
                if p not in target["pathways"]:
                    target["pathways"].append(p)
            target["pathways"] = [p for p in PATHWAYS if p in target["pathways"]]
            continue
        seen_teacher_keys.add(key)

        digest = hashlib.sha256((school_id + "|" + ident).encode("utf-8")).hexdigest()[:20]
        roles = parse_roles(row.get("User Roles"))
        teacher = {
            "id": "T-" + digest,
            "esis": raw_text(row.get("Teacher eSIS")),
            "nameEnglish": proper_name(row.get("Full Name")),
            "nameArabic": clean_optional(row.get("Full Name_Arabic")),
            "position": text(row.get("Designation")),
            "workEmail": text(row.get("Email")),
            "mobile": phone(row.get("Phone")),
            "pathways": parse_session_pathways(row.get("Session Pathway"), unknown_pathways),
            "specializationPathway": specialization(row.get("Specialization Pathway"), unknown_pathways),
            "roles": roles,
            "_sourceIdentity": ident,
        }
        school["teachers"].append(teacher)
        if any(role.casefold() == "school coordinator" for role in roles):
            coordinator_rows[school_id] = row

    # Add/retain manually approved schools with no invented people/pathways.
    for manual in MANUAL_SCHOOLS:
        if manual["schoolEsis"] not in schools:
            schools[manual["schoolEsis"]] = json.loads(json.dumps(manual, ensure_ascii=False))
        else:
            # Keep explicit identity fields authoritative if the school later appears
            # in another source without Arabic metadata.
            s = schools[manual["schoolEsis"]]
            for field in ["schoolName", "schoolNameArabic", "schoolType", "schoolTypeArabic", "region", "regionArabic"]:
                s[field] = manual[field]

    refreshed_coordinators = 0
    preserved_verified = 0
    for school_id, row in coordinator_rows.items():
        school = schools[school_id]
        old = school.get("coordinator") or empty_coordinator()
        same = bool(old.get("nameEnglish")) and same_person(old, row)
        verified = bool(old.get("verified")) if same else False
        if verified:
            preserved_verified += 1
        school["coordinator"] = {
            "nameEnglish": proper_name(row.get("Full Name")),
            "nameArabic": clean_optional(row.get("Full Name_Arabic")),
            "esis": raw_text(row.get("Teacher eSIS")),
            "position": text(row.get("Designation")),
            "emiratesId": text(old.get("emiratesId")) if same else "",
            "workEmail": text(row.get("Email")),
            "primaryEmail": text(old.get("primaryEmail")) if same else "",
            "mobile": phone(row.get("Phone")),
            "verified": verified,
        }
        refreshed_coordinators += 1

    # Remove importer-only keys and keep deterministic ordering.
    for school in schools.values():
        for teacher in school.get("teachers", []):
            teacher.pop("_sourceIdentity", None)
            teacher["pathways"] = [p for p in PATHWAYS if p in teacher.get("pathways", [])]
        school["teachers"] = sorted(school.get("teachers", []), key=lambda t: (t["nameEnglish"].casefold(), t["esis"].casefold()))
        school.setdefault("schoolNameArabic", "")
        school.setdefault("schoolTypeArabic", TYPE_AR.get(school.get("schoolType", ""), ""))
        school.setdefault("regionArabic", REGION_AR.get(school.get("region", ""), ""))
        school.setdefault("registeredPathways", [])
        school.setdefault("coordinator", empty_coordinator())

    ordered = sorted(schools.values(), key=lambda s: (s["schoolName"].casefold(), s["schoolEsis"].casefold()))
    data["schools"] = ordered
    data["teacherCoordinatorSource"] = source.name
    data["teacherCoordinatorSourceSha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    update_school_names_csv(ordered)

    total_teachers = sum(len(s.get("teachers", [])) for s in ordered)
    missing_teacher_ids = [
        {"schoolEsis": s["schoolEsis"], "teacherId": t["id"], "teacherName": t["nameEnglish"]}
        for s in ordered for t in s.get("teachers", []) if not text(t.get("esis"))
    ]
    missing_arabic_names = [s["schoolEsis"] for s in ordered if not text(s.get("schoolNameArabic"))]
    report = {
        "source": source.name,
        "sourceSha256": data["teacherCoordinatorSourceSha256"],
        "sourceRows": len(rows),
        "usableRows": len(rows) - len(excluded),
        "ignoredRows": excluded,
        "sourceSchools": len({text(r.get("eSIS_School")) for r in rows if valid_school_row(r)}),
        "existingSchoolCountBeforeRefresh": len(preexisting_ids),
        "teacherRecordsBeforeRefresh": preexisting_teachers,
        "teacherRecordsAfterRefresh": total_teachers,
        "coordinatorRowsApplied": refreshed_coordinators,
        "verifiedCoordinatorsPreserved": preserved_verified,
        "newSchoolsFromCsv": sorted(new_from_csv),
        "manualSchoolsAddedOrRetained": [s["schoolEsis"] for s in MANUAL_SCHOOLS],
        "totalSchoolsAfterRefresh": len(ordered),
        "schoolsWithoutArabicName": missing_arabic_names,
        "missingTeacherIdsRequiringEntryOnSelection": missing_teacher_ids,
        "unknownPathwayValuesIgnored": sorted(unknown_pathways),
        "note": "Existing registered school pathways are preserved. Teacher roster membership and person details come from the supplied CSV. Session Pathway populates teacher session pathways; Specialization Pathway is retained separately for reporting. Valid new schools from the CSV start with no registered school pathways. Blank/test source rows are ignored.",
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
