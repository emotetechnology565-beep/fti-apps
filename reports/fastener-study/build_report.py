"""Build the research PDF from measured workbook evidence; no database writes."""
from pathlib import Path
import json
import math
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

OUT = Path(__file__).resolve().parent
DATA = json.loads((OUT / 'workbook-analysis.json').read_text(encoding='utf-8'))
FONT = Path('C:/Users/rahul/.agents/skills/canvas-design/canvas-fonts')
for name, filename in [('Body','InstrumentSans-Regular.ttf'), ('Strong','InstrumentSans-Bold.ttf'),
                       ('Display','IBMPlexSerif-Regular.ttf'), ('Mono','IBMPlexMono-Regular.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONT / filename)))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Strong', italic='Body', boldItalic='Strong')
INK=colors.HexColor('#202F3A'); BLUE=colors.HexColor('#075299'); MUTED=colors.HexColor('#536471')
LINE=colors.HexColor('#D7E0E6'); PALE=colors.HexColor('#EFF5F9'); ALERT=colors.HexColor('#983D26')
W,H=A4; CW=W-88
STYLES={
    'body':ParagraphStyle('body',fontName='Body',fontSize=10.2,leading=15,textColor=INK,spaceAfter=9),
    'small':ParagraphStyle('small',fontName='Body',fontSize=8.7,leading=12.5,textColor=MUTED,spaceAfter=7),
    'title':ParagraphStyle('title',fontName='Display',fontSize=25,leading=31,textColor=INK,spaceAfter=14),
    'sub':ParagraphStyle('sub',fontName='Strong',fontSize=12,leading=17,textColor=INK,spaceBefore=8,spaceAfter=8),
    'kicker':ParagraphStyle('kicker',fontName='Strong',fontSize=9,leading=12,textColor=BLUE,spaceAfter=9),
    'cell':ParagraphStyle('cell',fontName='Body',fontSize=9,leading=12.5,textColor=INK),
    'head':ParagraphStyle('head',fontName='Strong',fontSize=8.5,leading=12,textColor=MUTED),
    'mono':ParagraphStyle('mono',fontName='Mono',fontSize=9,leading=14,textColor=BLUE,spaceAfter=7),
}
story=[]

def p(text, style='body'):
    # The embedded typeface lacks a rupee glyph; use the explicit ISO currency code.
    return Paragraph(text.replace('\u20b9', 'INR '), STYLES[style])

def add(text, style='body'):
    story.append(p(text,style))

def title(n, heading, intro=None):
    if story: story.append(PageBreak())
    add(f'FTI / FASTENER CATALOGUE STUDY / {n:02d}', 'kicker')
    add(heading,'title')
    if intro:add(intro)

def table(headers, rows, widths=None, font='cell'):
    cells=[[p(str(x),'head') for x in headers]]+[[p(str(x),font) for x in row] for row in rows]
    t=Table(cells,colWidths=widths or [CW/len(headers)]*len(headers),hAlign='LEFT',repeatRows=1)
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),
        ('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),
        ('BOTTOMPADDING',(0,0),(-1,-1),8),
        ('LINEBELOW',(0,0),(-1,0),.8,LINE),('LINEBELOW',(0,1),(-1,-1),.4,LINE),
    ]))
    story.extend([t,Spacer(1,12)])

def note(label, text, alert=False):
    content=p(f'<b>{label}</b><br/>{text}')
    t=Table([[content]],colWidths=[CW])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#FBF1ED') if alert else PALE),
                          ('BOX',(0,0),(-1,-1),.5,LINE),('LEFTPADDING',(0,0),(-1,-1),13),
                          ('RIGHTPADDING',(0,0),(-1,-1),13),('TOPPADDING',(0,0),(-1,-1),11),
                          ('BOTTOMPADDING',(0,0),(-1,-1),4)]))
    story.extend([t,Spacer(1,12)])

class Metrics(Flowable):
    def __init__(self, values):self.values=values;self.width=CW;self.height=78
    def draw(self):
        c=self.canv; width=CW/len(self.values)
        for i,(number,label) in enumerate(self.values):
            x=i*width
            c.setFillColor(BLUE);c.setFont('Display',29);c.drawString(x,43,number)
            c.setFillColor(MUTED);c.setFont('Body',9);c.drawString(x,23,label)
            if i:c.setStrokeColor(LINE);c.line(x-14,18,x-14,69)

class Model(Flowable):
    def __init__(self):self.width=CW;self.height=168
    def draw(self):
        c=self.canv
        nodes=[(0,110,145,48,'Shared sizes','425 dimensional pairs'),
               (181,110,145,48,'Configurations','4 grade / finish options'),
               (362,110,145,48,'Price schedules','Versioned rate records'),
               (181,25,145,48,'Sellable variant','SKU + size + configuration')]
        c.setStrokeColor(LINE);c.setLineWidth(1)
        for x,y,w,h,a,b in nodes:
            c.setFillColor(PALE);c.roundRect(x,y,w,h,4,stroke=1,fill=1)
            c.setFillColor(INK);c.setFont('Strong',10);c.drawString(x+10,y+29,a)
            c.setFont('Body',8);c.setFillColor(MUTED);c.drawString(x+10,y+13,b)
        c.setStrokeColor(BLUE)
        c.line(72,110,72,88);c.line(72,88,253,88)
        c.line(434,110,434,88);c.line(434,88,253,88)
        c.line(253,110,253,73)

class Screw(Flowable):
    def __init__(self):self.width=CW;self.height=158
    def draw(self):
        c=self.canv;c.setStrokeColor(INK);c.setLineWidth(1.25)
        x,y=56,82; head=28; length=245;diameter=28;flats=48
        c.rect(x,y-flats/2,head,flats,stroke=1,fill=0)
        c.line(x,y-12,x+head,y-12);c.line(x,y+12,x+head,y+12)
        c.rect(x+head,y-diameter/2,length,diameter,stroke=1,fill=0)
        for xx in range(x+head+3,x+head+length,7):
            c.line(xx,y-diameter/2,xx+5,y-diameter/2+4)
            c.line(xx,y+diameter/2,xx+5,y+diameter/2-4)
        cx=424;radius=28
        path=c.beginPath()
        for i in range(7):
            angle=math.radians(30+60*(i%6));px=cx+radius*math.cos(angle);py=y+radius*math.sin(angle)
            if not i:path.moveTo(px,py)
            else:path.lineTo(px,py)
        c.drawPath(path);c.circle(cx,y,14)
        c.setStrokeColor(BLUE);c.setFillColor(BLUE);c.setFont('Mono',9)
        c.line(x+head,45,x+head+length,45)
        for xx in [x+head,x+head+length]:c.line(xx,39,xx,63)
        c.drawCentredString(x+head+length/2,28,'L: customer-selected length')
        c.line(cx-24,130,cx+24,130);c.line(cx-24,124,cx-24,136);c.line(cx+24,124,cx+24,136)
        c.drawCentredString(cx,142,'F: standard lookup')
        c.drawString(x,132,'H');c.drawString(x+head+length+10,y-3,'D')
        c.setStrokeColor(MUTED);c.setDash([8,3,2,3]);c.line(30,y,355,y);c.line(cx-42,y,cx+42,y);c.setDash()
        c.setFillColor(MUTED);c.setFont('Body',8);c.drawString(30,7,'Schematic illustration of one reusable template. No certified dimensions shown.')

class SizeGrid(Flowable):
    def __init__(self):self.width=CW;self.height=153
    def draw(self):
        c=self.canv;ds=DATA['diameters'];ls=DATA['lengths'];pairs={(r['diameter'],r['length']) for r in DATA['source_rows']['SPL MS']}
        dx=11.7;dy=6.6;ox=42;oy=134
        c.setFont('Mono',7)
        for i,d in enumerate(ds):
            c.setFillColor(MUTED);c.drawRightString(32,oy-i*dy,str(d))
            for j,l in enumerate(ls):
                c.setFillColor(BLUE if (d,l) in pairs else colors.HexColor('#E6EDF2'))
                c.rect(ox+j*dx,oy-i*dy,8.5,4.4,fill=1,stroke=0)
        c.setFont('Body',8);c.setFillColor(MUTED);c.drawString(42,7,'Lengths 10 → 300, in workbook order. Blue = listed pair; grey = absent pair.')

title(1,'A smaller catalogue.<br/>A drawing for every size.',
      'A practical data and drawing strategy for the FTI fastener workbook, based on a complete audit of its four screw price sheets.')
story.append(Metrics([('1,700','source product rows'),('425','shared size / weight records'),('1','parametric drawing template')]))
note('Recommendation',
     'Share the 425 size-and-weight records, retain each sellable SKU, calculate derived values, and render drawings from a verified dimensional reference. Begin with exact source prices; introduce compact price bands after reconciliation.')
add('Three different reductions','sub')
table(['What gets smaller','What the evidence supports'],[
    ['Repeated size and weight data','1,700 repeated entries → 425 shared entries. <b>75% fewer copies</b> of those facts.'],
    ['Current pricing definitions','1,700 rates → <b>198 constant-price bands</b>, reproducing every supplied rate. This is a representation of this workbook, not an approved future pricing policy.'],
    ['Drawing assets','One renderer plus dimensions generates the views. No need to upload an image for every size. The workbook does not contain 1,700 drawings to remove.'],
], [155,CW-155])
add('What this changes for the business','sub')
add('Staff maintain dimensions and source weights once. Customers select a valid size, grade and finish, then see a consistent drawing and a calculation from the correct rate version. New grades reuse geometry without duplicating the whole catalogue.')
add('The workbook is only 247,810 bytes (about 242 KiB). At this scale, reducing editing mistakes and API payloads is more meaningful than promising a large hosting-cost saving. A normalized database may contain more rows overall because it adds references and history. No database-byte saving has been measured.','small')
add('Prepared 26 October 2026 · Read-only workbook and repository review · No live database migration or import performed.','small')

title(2,'What the workbook actually contains',
      'The detailed audit covers SPL MS, SPL 8.8, SPL 10.9 and SPL 12.9: rows 5–429 on each sheet. Headings and totals are excluded. The other eight sheets require their own models. [1]')
table(['Sheet','Configuration as supplied','Rows','Price bands'],[
    ['SPL MS','MS / SELF','425','59'],['SPL 8.8','8.8 / ZP','425','57'],
    ['SPL 10.9','10.9 / AB','425','57'],['SPL 12.9','12.9 / AB','425','25'],
], [90,220,75,CW-385])
add('<b>One family:</b> every audited row is HEX SCREW (FULL THREAD). All four sheets list the same 425 diameter/length pairs with identical source weights. No duplicate size pair or SKU occurs within an audited sheet. All primary weights and rates are positive.')
add('<b>Seventeen diameters:</b> 5, 6, 8, 10, 12, 14, 16, 20, 22, 24, 27, 30, 33, 36, 39, 42 and 45. There are 39 distinct lengths across the workbook. The size notation appears metric; confirm the unit before publication.')
add('The valid-size list must survive compression','sub')
story.append(SizeGrid())
note('A drawn screw is not automatically a listed product',
     '17 diameters × 39 lengths gives 663 possible pairs, but only 425 appear in the workbook. The other <b>238 pairs are unlisted</b>. A pricing interval must be checked against the allowed-size list; it must not make every intermediate length orderable.')
add('All 1,700 rows use 50 kg in the quantity column. Treat this as the workbook’s calculation quantity until FTI confirms whether it is also a pack size or minimum order. The workbook does not establish stock availability.','small')

title(3,'Separate geometry from the sale',
      'Use shared records for stable facts and preserve separate identities for what customers buy. These are logical responsibilities; adapt the existing app tables rather than duplicating its catalogue.')
story.append(Model())
table(['Record / responsibility','Store once or retain explicitly'],[
    ['Product family','Full-thread hex screw; drawing-template identifier and version.'],
    ['Size and weight','425 listed diameter/length pairs; source weight per 1,000; unit, source sheet/row and weight revision. Future geometry keys include standard and pitch.'],
    ['Configuration','Four supplied grade/finish combinations. Keep the workbook labels; confirm the exact technical definitions before standardizing them.'],
    ['Sellable variant / SKU','Original product code, shared size reference and configuration reference. Keep 1,700 identities if all combinations are published; stock and order history remain variant-specific.'],
    ['Price version','Currency, billing unit, rate, validity/publication state and source. Use exact rates first; approved bands can later supply the same lookup.'],
    ['Dimension reference','Standard, edition, diameter, pitch/series and head tolerances. Bind approved references to a product family before generating accurate drawings.'],
], [139,CW-139])
note('What stays separate',
     'Price, availability, stock, customer terms and order history cannot be inferred from geometry. Preserve original SKU strings: the 8.8 sheet uses both <b>510FTI-8.8ZP</b> and <b>515FTI8.8ZP</b>. Do not regenerate codes by concatenating dimensions.')
add('Use foreign keys for shared records, uniqueness for each allowed variant, and positive-value checks for weights and dimensions. Preserve exact decimal values for weights and money; apply a declared rounding policy at the billing boundary. [5, 6]','small')

title(4,'Pricing can shrink—but needs rules',
      'Grouping consecutive listed lengths with the same rate, separately for every diameter and sheet, produces 198 price bands. Replaying those bands reproduced all 1,700 supplied rates exactly. [2]')
table(['Approach','Active rate definitions','Decision'],[
    ['Exact rate per variant','1,700','Safest starting point; simplest reconciliation.'],
    ['Independent sheet bands','198','88.4% fewer numeric rate definitions. Requires the 425-size whitelist and exact coverage checks.'],
    ['Share identical 8.8 / 10.9 schedule','141','91.7% fewer definitions versus 1,700. Optional only: today’s equal prices do not imply permanently linked pricing.'],
], [146,99,CW-245])
add('Why a single grade surcharge will not work','sub')
add('The 8.8 premium over MS varies across the workbook: 0, 10, 12, 15, 16, 18, 20, 23, 31 and 33 rupees per kg. A rule such as “MS price + ₹15” would change many supplied rates. Across all four sheets there are 39 distinct price combinations; grouping only by equal price would create fragile editing links.')
table(['Size','MS','8.8','10.9','12.9'],[
    ['33 × 100','₹110','₹130','₹130','₹158'],
    ['33 × 110','₹115','₹115','₹115','₹158'],
    ['33 × 120','₹115','₹135','₹135','₹158'],
], [143,91,91,91,CW-416])
add('Rates above are per kg. Source: each screw sheet, J298:J300. The middle row is unusual, but it may be intentional. Retain ₹115 until the owner confirms a correction.','small')
note('Recommended publication behavior',
     'Keep all four schedules independently editable. Before publishing any change, expand bands over the allowed variants and show the affected SKUs and old/new rates. Reject gaps or overlapping rules. Record a new version; preserve the rate and weight used by already accepted quotes.')
add('The percentages describe fewer rate definitions, not total database rows, disk usage or API-cost savings. Bands also need boundaries, references, validation and audit history.','small')

title(5,'Generate the drawing from dimensions',
      'The customer selects a listed size and configuration. A deterministic renderer combines those choices with an approved dimensional reference and produces side/end views. One SVG template serves this full-thread hex-screw family. [7]')
story.append(Screw())
table(['Input','Where it comes from'],[
    ['Diameter and length','The selected allowed-size record, with explicit units.'],
    ['Head width, height, pitch','A verified standard/edition table linked to this product. Values are absent from the audited price-sheet columns.'],
    ['Full-thread geometry','The family’s drawing rules; include runout/chamfer details only when defined by the approved reference.'],
    ['Grade and finish label','The selected configuration; no duplicate geometry record needed when dimensions are genuinely the same.'],
], [154,CW-154])
note('The app already has useful reference data—but incomplete coverage',
     'The existing metric dimension dataset contains 15 diameters, of which 14 overlap this workbook. <b>5, 42 and 45 are missing</b>, affecting 66 of the 425 size pairs. Coverage for the other 359 pairs is a lookup match, not confirmation that the historical standard applies to the sold product. [3, 4]', True)
add('The supplied photograph is an inch-series UNC/UNF chart. It cannot supply metric head and pitch values by simple unit conversion. Confirm the intended standard and units, then fill the missing reference entries. Offer a clearly labeled schematic preview while exact geometry is unresolved.')
add('Store template version + reference version + selected parameters. Render on the device/browser; cache by those values if useful. Save a PDF/SVG only for an approved document or order record. A later change to a template must not silently alter an already approved drawing.','small')

title(6,'Calculate the repeats. Preserve the evidence.',
      'The workbook’s formula columns can become application calculations. The original rate and weight remain auditable inputs; order and quotation records retain their accepted snapshots.')
table(['Value','Calculation'],[
    ['Weight per piece','weight per 1,000 ÷ 1,000'],
    ['Price per 1,000','weight per 1,000 × rate per kg'],
    ['Price per piece','weight per 1,000 × rate per kg ÷ 1,000'],
    ['Amount billed by kg','entered kg × rate per kg'],
    ['Estimated pieces for a weight','entered kg × 1,000 ÷ weight per 1,000'],
], [181,CW-181])
add('<b>Workbook example:</b> 5 × 10, MS / SELF, 2.63 kg per 1,000 and ₹120/kg gives ₹0.3156 per piece, ₹315.60 per 1,000 and ₹6,000 for 50 kg. Keep precision during calculation. Piece estimates may be fractional; do not present them as guaranteed packed counts. [1: SPL MS, row 5]')
note('Resolve a weight-source conflict',
     'For <b>20 × 100</b>, the workbook gives <b>280.75 kg per 1,000</b> (D165 on all four sheets), while the app’s metric weight chart gives <b>270.75</b> and already flags it for review. Keep both sources and choose an approved commercial weight before publication. Do not average them or silently overwrite either. [1, 3]', True)
add('Cross-check against the app’s metric bolt weights','sub')
add('Of the 425 workbook size pairs, <b>297 match exactly</b>, <b>1 differs</b>, and <b>127 have no matching reference entry</b>. Equal values support reuse after family/standard validation; missing entries are not zeros. The workbook’s identical weights across grades are a source assumption, not proof of measured finished-product weight.')
add('Column K is labeled ambiguously (“Rate / piece … Per 1000 Pcs”), but its formula computes the price per 1,000. Use explicit units in the app. Bill by the selected unit; never add the kg-based and piece-based totals for the same goods. The workbook does not settle taxes, freight, discounts or invoice-rounding policy.','small')

title(7,'Fit the model into the current FTI app',
      'The repository already separates products, variants, quotations and reference charts. Extend those boundaries gradually; keep fastener selling compatible with the existing quotation workflow. [4]')
table(['Stage','Concrete outcome and completion check'],[
    ['1 · Stage and reconcile','Import a draft dataset with source sheet/row/hash. Reproduce 1,700 codes, rates, weights and configurations. Flag the unusual rate and conflicting weight. Publishing requires their disposition, not an automatic correction.'],
    ['2 · Share size records','Link the 1,700 variants to 425 shared sizes and four configurations. Retain SKU IDs and original codes. Compare the expanded model to every source row.'],
    ['3 · Add drawing references','Confirm units and standard edition; supply missing sizes 5, 42 and 45. Verify dimension labels, proportions, full-thread behavior, phone layout and SVG/PDF output.'],
    ['4 · Pilot compact pricing','Start from exact variant prices. Preview the 198-band representation; prove one matching band per allowed variant and identical results. Give staff independent control over each configuration.'],
    ['5 · Publish in a controlled release','Recalculate rates on the server, preserve quote snapshots and existing permissions. Exercise customer/staff flows with approved accounts. Keep the prior published catalogue version available for rollback.'],
], [115,CW-115])
add('Customer experience','sub')
add('Select full-thread hex screw → choose a valid diameter → see only its listed lengths → choose grade/finish → enter kg or pieces → preview the drawing and request a quotation. An unlisted custom size goes through a separate enquiry; a drawing alone does not authorize a price or order.')
add('Acceptance checks that matter','sub')
add('Check all 1,700 reconstructed records; reject the 238 unlisted diameter/length pairs; test missing dimensions, invalid quantities and stale price versions. Verify that changing a rate affects only the intended variants and leaves accepted quotes unchanged. Test drawing exports and small-screen interactions separately from price calculations.')
add('Suggested code ownership: reference lookup and drawing inputs in catalog models; rendering in catalog components; rates and publication in pricing/services; accepted snapshots in quotations/orders. Actual table names and APIs should follow the existing schema. No Expo or database code is changed by this study.','small')

title(8,'Decisions, evidence and next step',
      'The right next deliverable is a staged fastener configurator backed by this reconciled dataset. The data model can be prepared now; accurate published drawings and commercial prices depend on the decisions below.')
table(['Decision to resolve','Why it matters'],[
    ['Confirm metric unit and standard edition','Controls pitch, head dimensions, tolerances and whether the existing historical reference can be used.'],
    ['Choose the approved 20 × 100 weight','Workbook: 280.75; app reference: 270.75 kg/1,000. Preserve the rejected source in the audit trail.'],
    ['Confirm 33 × 110 rates','8.8 and 10.9 both show ₹115/kg. Compression preserves the value; publication needs an owner disposition.'],
    ['Define 50 kg and billing rules','Calculation quantity, pack size and MOQ are different concepts. Confirm selling unit, rounding and applicable commercial additions.'],
    ['Decide whether grades share a price schedule','Prefer independent schedules initially. If linked, make the relationship explicit and allow future separation.'],
], [187,CW-187])
add('Evidence and methodology','sub')
add('[1] <b>FTI_Smart_Fasteners_Price_List (2).xlsx</b>, supplied local file, 247,810 bytes. Full primary-input scan of four sheets, rows 5–429; the other eight sheets are out of scope. Formula text was inspected; Excel formulas were not recalculated. The analysis uses primary numeric weight/rate cells.', 'small')
add('[2] <b>workbook-analysis.json</b> and <b>analyze_workbook.py</b> beside this report. Bands are maximal constant-rate runs over sorted listed lengths for each diameter/sheet. Every reconstructed price was compared with Decimal arithmetic: 1,700 of 1,700 matched. This verifies reproduction, not the correctness of source business values.', 'small')
add('[3] <b>src/features/catalog/data/fastener-references.json</b> and its referenced source PDFs. Counts and weight comparisons use the existing local transcription; no new dimensional standard or certification is asserted.', 'small')
add('[4] Local repository: catalog model/types.ts; model/product-references.ts; components/AddToCart.tsx; quotations/components/CategoryQuotationButton.tsx; docs/product-reference-charts.md. Source review only; production data and signed-in delivery were not revalidated.', 'small')
add('[5] <link href="https://www.postgresql.org/docs/current/ddl-constraints.html" color="#075299">PostgreSQL: Constraints</link> — foreign keys, uniqueness and validation.<br/>[6] <link href="https://www.postgresql.org/docs/current/datatype-numeric.html" color="#075299">PostgreSQL: Numeric types</link> — exact numeric values for money.<br/>[7] <link href="https://developer.mozilla.org/en-US/docs/Web/SVG" color="#075299">MDN: Scalable Vector Graphics</link> — scalable, text-based 2D vector graphics. External references accessed 26 October 2026.', 'small')
add('Workbook SHA-256:<br/>'+DATA['sha256'][:32]+'<br/>'+DATA['sha256'][32:], 'mono')


def furniture(c, doc):
    c.saveState()
    c.setStrokeColor(LINE);c.setLineWidth(.5);c.line(44,40,W-44,40)
    c.setFillColor(MUTED);c.setFont('Body',8)
    c.drawString(44,27,'FTI  /  Parametric catalogue & data study')
    c.drawRightString(W-44,27,f'{doc.page:02d}')
    c.restoreState()


pdf=OUT / 'FTI_Fastener_Data_and_Drawing_Strategy.pdf'
doc=SimpleDocTemplate(str(pdf),pagesize=A4,rightMargin=44,leftMargin=44,topMargin=42,bottomMargin=55,
                      title='FTI Fastener Data and Drawing Strategy',author='FTI — prepared with Codex',
                      subject='Workbook audit, database normalization, price-band analysis and parametric drawings')
doc.build(story,onFirstPage=furniture,onLaterPages=furniture)
print(pdf)
