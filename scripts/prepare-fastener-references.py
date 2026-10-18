"""Extract the four supplied FTI PDFs into product reference charts. --upload publishes source PDFs to Bunny."""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import urllib.error
import urllib.request
from urllib.parse import urlparse

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/features/catalog/data/fastener-references.json'
FILES = {
    'bolt-dimensions': ('BOLT-TECHNICAL-DIAMENTIONS-B5BxHUH4.pdf', 'Hex bolt and screw dimensions', 'IS:1363-1967 / ISO-272 / BS:4190', 'mm'),
    'metric-weights': ('WEIGHT-COUNT-Ccgf-h4J (1).pdf', 'Metric bolt and nut weights', 'IS:1364-1992 coarse thread', 'kg per 1,000 pieces'),
    'unc-weights': ('WEIGHT-COUNT-BS-STD-DTyTNIO9.pdf', 'UNC bolt and nut weights', 'BS:1768 UNC', 'kg per 1,000 pieces'),
    'washer-weights': ('WEIGHT-COUNT-WASHERS-GpgTiSCt.pdf', 'Washer and lock nut weights', 'See individual fastener type', 'kg per 1,000 pieces'),
}
NUMERIC = re.compile(r'^\d+(?:\.\d+)?$')


def inch_label(value):
    return value.replace('"', '\u2033').replace('.', ' ')


def read_table(filename):
    with pdfplumber.open(ROOT / 'docs' / filename) as pdf:
        if len(pdf.pages) != 1:
            raise RuntimeError('Unexpected source page count: ' + filename)
        tables = pdf.pages[0].extract_tables()
        if len(tables) != 1:
            raise RuntimeError('Unexpected table layout: ' + filename)
        return tables[0]


def extract():
    charts, records = [], []
    for chart_id, (filename, title, standard, unit) in FILES.items():
        table = read_table(filename)
        groups = []
        chart = dict(id=chart_id, title=title, standard=standard, unit=unit, filename=filename,
                     sha256=hashlib.sha256((ROOT / 'docs' / filename).read_bytes()).hexdigest(), page=1, groups=groups)
        if chart_id == 'bolt-dimensions':
            groups.append(dict(id='hex-bolt', label='Hex bolts / screws'))
            labels = ['Thread pitch', 'Major diameter min.', 'Major diameter max.', 'Pitch diameter min.',
                      'Pitch diameter max.', 'Across flats min.', 'Across flats max.', 'Across corners min.',
                      'Head thickness min.', 'Head thickness max.']
            for row in table:
                if not row[0] or not re.fullmatch(r'M-\d+', row[0]):
                    continue
                if not all(NUMERIC.fullmatch(cell or '') for cell in row[1:11]):
                    raise RuntimeError('Invalid bolt dimensions: ' + str(row))
                record = dict(chartId=chart_id, groupId='hex-bolt', size=row[0].replace('-', ''),
                              dimensions=dict(zip(labels, row[1:11])))
                if row[0] == 'M-24':
                    record['reviewNote'] = 'Source shows a narrow head-thickness range of 15.45-15.55 mm. Confirm with FTI before specifying.'
                records.append(record)
            chart['notes'] = [
                'Dimensions are in mm. The PDF identifies thread tolerance class IS:4218-8g.',
                'Partial-thread minimum b: L <= 130 mm: 2d + 6; 130 < L <= 200 mm: 2d + 12; L > 200 mm: 2d + 25.',
                'The source prints a thread-length tolerance of -0 / +2P. Its b1 column is blank; no b1 value is inferred.',
                'This is a source reference for black hex bolts and screws; confirm the applicable standard for the supplied product.',
            ]
        elif chart_id in ('metric-weights', 'unc-weights'):
            chart['date'] = '2026-01-01'
            chart['notes'] = ['Approximate source weights in kg per 1,000 pieces. Blank cells are omitted; no values are interpolated.',
                              'Bolt rows and the separate nut row are distinct. The PDF does not state that each bolt weight includes a nut.']
            groups.extend([dict(id='hex-bolt', label='Hex bolts'), dict(id='hex-nut', label='Hex nuts')])
            header = table[2]
            blocks = [(0, range(1,6)), (7, range(8,14)), (14, range(15,19))] if chart_id == 'metric-weights' else [(0, range(1,7)), (7, range(8,18))]
            for row in table[4:]:
                nut = row[0] == 'NUT'
                for length_col, size_cols in blocks:
                    length = (row[length_col] or '').strip()
                    if not nut and (not length or length == 'NUT'):
                        continue
                    for col in size_cols:
                        weight = (row[col] or '').strip()
                        if not weight:
                            continue
                        if not NUMERIC.fullmatch(weight):
                            raise RuntimeError('Unexpected weight cell: ' + weight)
                        size = header[col].replace('-', '') if chart_id == 'metric-weights' else inch_label(header[col])
                        record = dict(chartId=chart_id, groupId='hex-nut' if nut else 'hex-bolt', size=size, weightKgPer1000=float(Decimal(weight)))
                        if not nut:
                            record['length'] = length.replace('MM', ' mm') if chart_id == 'metric-weights' else inch_label(length)
                        if chart_id == 'metric-weights' and not nut:
                            if size == 'M20' and length == '100MM':
                                record['reviewNote'] = 'Source value 270.75 needs confirmation: adjacent 95 mm and 110 mm entries are 270.50 and 301.25.'
                            if size == 'M6' and length in ('35MM', '40MM'):
                                record['reviewNote'] = 'Confirm this source entry: the M6 chart increases only from 8.91 at 35 mm to 9.04 at 40 mm.'
                        records.append(record)
        else:
            chart['date'] = '2026-01-01'
            chart['notes'] = ['Approximate source weights in kg per 1,000 pieces. Washer types and standards are separate; do not substitute one type for another.']
            sizes = table[2]
            group_defs = [
                ('PLAIN WASHERS', 'plain-washer', 'Plain washers', 'IS:2016'),
                ('MACHINED WASHER', 'machined-washer', 'Machined washers', 'IS:2016'),
                ('IS:5372', 'taper-5372', 'Taper washers', 'IS:5372'),
                ('IS:5374', 'taper-5374', 'Taper washers', 'IS:5374'),
                ('HEAVY WASHER', 'heavy-washer', 'Heavy washers', 'IS:6649'),
                ('HEX LOCK NUT', 'hex-lock-nut', 'Hex lock nuts', 'IS:1364-92'),
                ('SPRING WASHER', 'spring-washer', 'Spring washers', 'IS:3063'),
            ]
            current = None
            for row in table[3:]:
                if row[0] and not NUMERIC.fullmatch(row[0]):
                    matches = [group for group in group_defs if group[0] in row[0]]
                    if len(matches) != 1:
                        raise RuntimeError('Unrecognized washer group: ' + row[0])
                    _, group_id, label, group_standard = matches[0]
                    groups.append(dict(id=group_id, label=label, standard=group_standard))
                    current = group_id
                elif row[0]:
                    if not current or len(row) != 17 or not all(NUMERIC.fullmatch(cell or '') for cell in row):
                        raise RuntimeError('Invalid washer row')
                    for size, weight in zip(sizes, row):
                        record = dict(chartId=chart_id, groupId=current, size=size.replace('-', ''), weightKgPer1000=float(Decimal(weight)))
                        if current.startswith('taper-') and size in ('M8', 'M10'):
                            record['reviewNote'] = 'Confirm the source dimensions/thickness: this table lists M10 lighter than M8.'
                        records.append(record)
                    current = None
        charts.append(chart)
    keys = [(r['chartId'], r['groupId'], r['size'], r.get('length')) for r in records]
    if len(keys) != len(set(keys)):
        raise RuntimeError('Duplicate extracted chart row')
    expected = {'bolt-dimensions': 15, 'washer-weights': 119}
    for key, count in expected.items():
        if sum(r['chartId'] == key for r in records) != count:
            raise RuntimeError('Incomplete extraction: ' + key)
    return dict(charts=charts, rows=records)


def upload_sources(dataset):
    cfg = {}
    for line in (ROOT / '.env').read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, val = line.split('=', 1)
            cfg[key.strip()] = val.strip().strip('\"\'')
    endpoint = cfg['BUNNY_STORAGE_ENDPOINT'].rstrip('/')
    if not endpoint.startswith('https://'):
        endpoint = 'https://' + endpoint
    host = urlparse(endpoint).hostname or ''
    if host != 'storage.bunnycdn.com' and not host.endswith('.storage.bunnycdn.com'):
        raise RuntimeError('Unexpected Bunny endpoint')
    cdn = cfg['BUNNY_CDN_BASE_URL'].rstrip('/')
    if urlparse(cdn).scheme != 'https':
        raise RuntimeError('Expected HTTPS CDN URL')
    for chart in dataset['charts']:
        data = (ROOT / 'docs' / chart['filename']).read_bytes()
        key = f"product-documents/fasteners/{chart['sha256']}/{chart['id']}.pdf"
        request = urllib.request.Request(endpoint + '/' + cfg['BUNNY_STORAGE_ZONE'] + '/' + key,
            data=data, headers={'AccessKey': cfg['BUNNY_STORAGE_ACCESS_KEY'], 'Content-Type': 'application/pdf'}, method='PUT')
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
        with urllib.request.urlopen(cdn + '/' + key, timeout=30) as response:
            downloaded = response.read()
        if hashlib.sha256(downloaded).hexdigest() != chart['sha256']:
            raise RuntimeError('Source PDF CDN verification failed: ' + chart['id'])
        chart['pdfUrl'] = cdn + '/' + key
        print('Verified source PDF:', chart['id'], flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upload', action='store_true')
    args = parser.parse_args()
    dataset = extract()
    if args.upload:
        upload_sources(dataset)
    elif OUT.exists():
        previous = {chart['sha256']: chart.get('pdfUrl') for chart in json.loads(OUT.read_text())['charts']}
        for chart in dataset['charts']:
            if previous.get(chart['sha256']):
                chart['pdfUrl'] = previous[chart['sha256']]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('Extracted reference rows:', {c['id']: sum(r['chartId'] == c['id'] for r in dataset['rows']) for c in dataset['charts']})


if __name__ == '__main__':
    main()
