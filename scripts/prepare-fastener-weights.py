"""Import the ITA workbook losslessly into a repeatable SQL deployment package.

Requires openpyxl. Non-numeric published values are retained for review, never guessed.
"""
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / 'exports/ita-weight-chart/ITA_Fasteners_Weight_Charts.xlsx'
OUT = ROOT / 'deployment/fastener-weights'
MAX_PART_BYTES = 80_000


def quote(value):
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return str(value).lower()
    return "'" + str(value).replace("'", "''") + "'"


def main():
    wb = load_workbook(WORKBOOK, data_only=True, read_only=True)
    rows = list(wb['All Values'].values)
    assert rows.pop(0) == ('Chart', 'Product', 'Specification', 'Published unit',
                           'Row / size', 'Column / type', 'Value', 'Published text', 'Source line')
    records, review = [], []
    for excel_row, row in enumerate(rows, 2):
        chart, product, spec, unit, size, column, value, published, line = row
        compact_unit = unit.upper().replace(' ', '')
        if '100NOS' in compact_unit:
            basis = '100_pieces'
        elif 'PERMETRE' in compact_unit:
            basis = 'metre'
        elif 'PERNO.' in compact_unit:
            basis = 'piece'
        else:
            raise ValueError(f'Unknown unit: {unit}')
        try:
            weight = Decimal(str(published).replace(',', ''))
            # Match workbook's numeric cell too; malformed source text stays under review.
            if not isinstance(value, (int, float)) or not weight.is_finite() or weight <= 0:
                raise InvalidOperation
            if weight != Decimal(str(value)):
                raise ValueError(f'Workbook mismatch at row {excel_row}')
        except InvalidOperation:
            weight = None
            review.append({'workbook_row': excel_row, 'chart': chart, 'row': size,
                           'column': column, 'published_text': published})
        assert all(v is not None for v in (chart, product, unit, size, column, published, line))
        records.append(('approximate-weight', excel_row, chart, product, spec or '', unit,
                        size, column, published, weight, basis, '', line, weight is None))
    wb.close()
    schema = (ROOT / 'supabase/migrations/202610260001_fastener_weight_reference.sql').read_text()
    columns = ('source_key,workbook_row,chart,product,specification,published_unit,'
               'row_label,column_label,published_text,published_weight,weight_basis,'
               'source_url,source_line,review_required')
    updates = ','.join(f'{c}=excluded.{c}' for c in columns.split(',')[2:])
    sql = 'begin;\n' + schema + '\n'
    for start in range(0, len(records), 500):
        values = ',\n'.join('(' + ','.join(map(quote, r)) + ')' for r in records[start:start+500])
        sql += f'insert into public.fastener_weight_reference({columns}) values\n{values}\n'
        sql += f'on conflict(source_key,workbook_row) do update set {updates};\n'
    sql += "notify pgrst, 'reload schema';\ncommit;\n"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'publish.sql').write_text(sql, encoding='utf-8')
    # SQL Editor rejects large scripts. Every part has its own transaction and
    # upsert, so no session-scoped staging table or shared transaction is needed.
    setup_name = '01_setup.sql'
    setup = "begin;\n" + schema + "\nnotify pgrst, 'reload schema';\ncommit;\n"
    (OUT / setup_name).write_text(setup, encoding='utf-8', newline='\n')
    prefix = ("-- Run 01_setup.sql first. Safe to rerun this part.\n"
              "begin;\n"
              f"insert into public.fastener_weight_reference({columns}) values\n")
    suffix = f'\non conflict(source_key,workbook_row) do update set {updates};\ncommit;\n'
    parts, current_values = [], []
    for record in records:
        row_sql = '(' + ','.join(map(quote, record)) + ')'
        candidate = prefix + ',\n'.join(current_values + [row_sql]) + suffix
        if len(candidate.encode('utf-8')) > MAX_PART_BYTES and current_values:
            parts.append(prefix + ',\n'.join(current_values) + suffix)
            current_values = []
        current_values.append(row_sql)
    if current_values:
        parts.append(prefix + ',\n'.join(current_values) + suffix)
    assert all(len(part.encode('utf-8')) <= MAX_PART_BYTES for part in parts)
    part_names = []
    for number, part in enumerate(parts, 1):
        name = f'02_import_part_{number:02d}.sql'
        (OUT / name).write_text(part, encoding='utf-8', newline='\n')
        part_names.append(name)
    verify_name = '03_verify.sql'
    verification = f"""-- Expected: {len(records)} rows, {len({r[2] for r in records})} charts,
-- {len(records)-len(review)} numeric weights, {len(review)} review row.
select count(*) as total_rows, count(distinct chart) as charts,
 count(*) filter(where not review_required) as numeric_weights,
 count(*) filter(where review_required) as review_rows,
 count(*) = {len(records)} and count(distinct chart) = {len({r[2] for r in records})}
 and count(*) filter(where review_required) = {len(review)} as import_complete
from public.fastener_weight_reference where source_key = 'approximate-weight';
"""
    (OUT / verify_name).write_text(verification, encoding='utf-8', newline='\n')
    editor_files = [setup_name, *part_names, verify_name]
    assert all((OUT / name).stat().st_size <= MAX_PART_BYTES for name in editor_files)
    (OUT / 'sql-editor-files.json').write_text(json.dumps({
        'max_part_bytes': MAX_PART_BYTES,
        'files': [{'file': name, 'bytes': (OUT / name).stat().st_size} for name in editor_files],
    }, indent=2) + '\n', encoding='utf-8')
    report = {'rows': len(records), 'charts': len({r[2] for r in records}),
              'matchable': len(records)-len(review), 'review': review,
              'sql_editor_import_parts': len(parts), 'sql_editor_max_part_bytes': MAX_PART_BYTES}
    (OUT / 'import-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
