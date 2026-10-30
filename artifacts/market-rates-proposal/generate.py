from pathlib import Path
from html import escape

OUT = Path(__file__).resolve().parent
parts = []
def add(s): parts.append(s)
def box(x,y,w,h,fill='#ffffff',stroke='#dbe2e8',r=16):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}"/>')
def text(x,y,value,size=20,color='#172d40',weight=400):
    add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(value)}</text>')
def lines(x,y,values,size=20,color='#526779',gap=29):
    for i,v in enumerate(values): text(x,y+i*gap,v,size,color)
def line(x1,y1,x2,y2,color='#dbe2e8'):
    add(f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="2" fill="none"/>')
def arrow(x1,y1,x2,y2):
    add(f'<path d="M{x1} {y1} L{x2} {y2}" stroke="#167d80" stroke-width="3" fill="none" marker-end="url(#arrow)"/>')
def label(x,y,n,title):
    text(x,y,n,17,'#167d80',700); text(x+45,y,title,27,weight=700)

add('''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2240" viewBox="0 0 1600 2240" role="img" aria-labelledby="title desc">
<title id="title">FTI Market Rates — proposed pricing and history flow</title>
<desc id="desc">Client review proposal showing fast admin updates, pricing fields awaiting confirmation, dated price records and customer history. Illustrative values are not current market quotes.</desc>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 1 L8 5 L0 9" fill="none" stroke="#167d80" stroke-width="1.7"/></marker></defs>
<rect width="1600" height="2240" fill="#f3f5f7"/>
<g font-family="Segoe UI, Arial, sans-serif">''')
box(0,0,1600,255,'#102d42','#102d42',0)
text(64,57,'FIELDFAST TECH INTERNATIONAL',19,'#9dc6ce',700)
text(64,119,'Market rates. Every update, preserved.',46,'#ffffff',700)
text(64,165,'Proposed admin workflow + customer price history',25,'#d3e1e9')
text(64,212,'CLIENT REVIEW  /  30 OCT 2026  /  VERSION 01',16,'#9dc6ce',600)
box(1240,39,294,44,'#254758','#426373',22)
text(1264,68,'PROPOSAL • TO CONFIRM',17,'#ffffff',700)

box(64,282,1472,88,'#fff7e6','#ead4a7')
text(88,316,'Starting point: your market.txt report',21,'#7c5817',700)
text(88,347,'Ingot / Scrap / Billet + city / grade + quoted rate + movement + report date and time.',21,'#7c5817')

label(64,423,'01','Admin updates prices quickly')
cards=[(64,'Select the market',['Choose material, city and grade.','Load the latest saved values.']),
       (440,'Edit changed values',['Update a row, paste Excel data,','or apply a bulk + / − adjustment.']),
       (816,'Review before publishing',['See old → new values and totals.','Set effective date + time (IST).']),
       (1192,'Publish the update',['Save the batch together.','Show prices when effective.'])]
for i,(x,title,body) in enumerate(cards):
    box(x,448,344,152)
    text(x+22,481,f'STEP {i+1}',14,'#167d80',700)
    text(x+22,517,title,22,weight=700)
    lines(x+22,552,body,17,gap=25)
    if i<3: arrow(x+350,524,x+370,524)
text(64,631,'Suggested defaults: carry forward rolling / profit values; publish only edited rows. Both rules need approval.',19)

label(64,688,'02','Pricing model — confirm the definitions and formula')
box(64,713,930,366)
text(88,749,'ILLUSTRATIVE ADMIN ENTRY  •  INR PER METRIC TONNE',16,'#526779',700)
box(88,766,882,41,'#edf2f5','#edf2f5',5)
for x,t in [(104,'Field'),(388,'Example'),(595,'Proposed behaviour')]: text(x,794,t,17,weight=700)
rows=[('Base price','₹46,300','Admin enters the source rate'),('Increase / adjustment','+₹200','Meaning to confirm with client'),('Increased price','₹46,500','Calculated: base + adjustment'),('Rolling price / charge','₹3,000','Definition and preset rule to confirm'),('Profit','₹500','Amount or percentage to confirm'),('Final selling price','₹50,000','Calculated if this model is approved')]
for i,(a,b,c) in enumerate(rows):
    y=840+i*41
    if i==5: box(88,y-27,882,39,'#e6f3ef','#e6f3ef',5)
    text(104,y,a,18,weight=600 if i==5 else 400)
    text(388,y,b,19,weight=700)
    text(595,y,c,17)
box(1018,713,518,366,'#102d42','#102d42')
text(1046,753,'Proposed calculation',25,'#ffffff',700)
lines(1046,800,['Base + adjustment = increased price','Increased + rolling + profit = final'],21,'#d3e1e9',34)
line(1046,866,1508,866,'#426373')
text(1046,904,'Keep these concepts separate',21,'#ffffff',700)
lines(1046,942,['Market movement: change from prior quote.','Price adjustment: a pricing input, if required.','Do not add movement twice to a source rate.'],18,'#d3e1e9',30)
text(1046,1047,'Rolling and profit are absent from market.txt.',17,'#edcd94',600)

arrow(800,1094,800,1120)
box(64,1137,1472,124,'#e7f1f2','#c5dcde')
text(88,1174,'03   One dated record for each published price',26,weight=700)
text(88,1211,'Save market + material + grade, all price inputs, effective date/time, publication time and admin.',20)
text(88,1240,'Preserve earlier records. Corrections create a linked revision; past values remain traceable. Proposed policy.',18,'#526779')
arrow(800,1272,800,1299)

label(64,1346,'04','Customer sees the latest rate and its history')
box(64,1371,660,371)
text(90,1409,'MARKET RATES',17,'#167d80',700)
text(90,1449,'Mandi Gobindgarh · Billet',28,weight=700)
text(90,1484,'Illustrative update · 28 Oct 2026, 12:00 PM IST',18,'#526779')
text(90,1546,'₹50,000',46,weight=700); text(302,1546,'/ tonne',21,'#526779')
text(90,1580,'−₹200 vs previous published final price',20,'#b34a43',600)
line(90,1600,698,1600)
text(90,1634,'Search city / grade     |     Ingot · Scrap · Billet',20)
box(90,1660,608,52,'#167d80','#167d80',10)
text(258,1693,'View price history →',21,'#ffffff',600)
arrow(734,1558,768,1558)
box(788,1371,748,371)
text(814,1410,'PRICE HISTORY',17,'#167d80',700)
text(814,1448,'Filter by date range · choose an update time',23,weight=700)
box(814,1470,696,38,'#edf2f5','#edf2f5',6)
text(830,1496,'Today       7 days       30 days       Custom dates',17)
for i,(d,p,c) in enumerate([('28 Oct · 12:00 PM','₹50,000','−₹200'),('28 Oct · 10:00 AM','₹50,200','+₹100'),('27 Oct · 04:00 PM','₹50,100','—')]):
    y=1550+i*49
    text(830,y,d,21); text(1175,y,p,23,weight=700)
    text(1394,y,c,19,'#b34a43' if i==0 else '#167d80')
    line(814,y+15,1510,y+15)
text(814,1714,'Tap a row → approved customer breakdown for that time.',18,'#526779')
text(64,1776,'Customer visibility needs approval: show final price only, or selected breakdown fields. Profit defaults to admin-only.',19)

box(64,1813,1472,183,'#ffffff','#dbe2e8')
text(88,1851,'Please confirm or suggest changes',28,weight=700)
lines(88,1890,['1. What does rolling price mean? Confirm one real calculation.','2. Which values are preset, and do they vary by material / mill?','3. What can customers see? Should profit stay private?'],19,gap=32)
lines(840,1890,['4. Are GST / freight included? Confirm ₹ / tonne and IST.','5. Who can publish? Is a separate approval step needed?','6. Every update in history? Allow backdating or scheduling?'],19,gap=32)

text(64,2040,'REFERENCE PATTERNS',16,'#167d80',700)
add('<a href="https://www.bigmint.co/prices/detail" target="_blank">')
text(64,2075,'BigMint ↗',22,weight=700); add('</a>')
text(64,2105,'Date filters, comparisons and price chart options.',18,'#526779')
add('<a href="https://www.steelorbis.com/steel-prices/steel-price-analysis/" target="_blank">')
text(822,2075,'SteelOrbis ↗',22,weight=700); add('</a>')
text(822,2105,'Product / location selection and historical comparisons.',18,'#526779')
text(64,2141,'Public reference pages reviewed 30 Oct 2026. These support customer history patterns; admin workflow is our proposal.',17,'#526779')
line(64,2170,1536,2170)
text(64,2205,'Please review this proposed flow and share any changes before we finalize the scope.',22,weight=600)
add('</g></svg>')
OUT.joinpath('fti-market-rates-flow.svg').write_text('\n'.join(parts),encoding='utf-8')
print(OUT / 'fti-market-rates-flow.svg')
