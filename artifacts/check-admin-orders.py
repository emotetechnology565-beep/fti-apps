from pathlib import Path
exec(Path('scripts/raw-material-order-browser.py').read_text(encoding='utf-8').split('with sync_playwright() as p:')[0])
original_api=api
material={'id':'material-request','created_at':'2026-10-27T10:30:00Z','details':{'reference':'FTI-RM-REVIEW','material':'Round bar','grade':'EN-8D','size':'32 mm','quantity':'2 MT','name':'Sample buyer','business':'Sample Engineering','phone':'+919000000001','location':'Bagha Purana, Punjab 142038','manual_match':{'requested_size':'31 mm','matched_size':'32 mm'}},'deliveries':[{'id':'delivery-1','phone':'+919000000001','template':'fti_raw_material_received_v1','status':'failed','error':'Example delivery failure'}]}
definition=json.loads(Path('deployment/fastener-dimensions/hex-source-definitions.json').read_text(encoding='utf-8'))[0]
fastener={'id':'fastener-request','created_at':material['created_at'],'details':dict(material['details'],reference='FTI-FS-REVIEW',material='hex-bolt',standard='IS 1363',quantity='100 pieces',length_mm=120),'definition':definition,'selection':{'input':{'length':120}},'deliveries':[]}
retries=[]
def api(route):
 req=route.request
 body=req.post_data_json or {} if req.method=='POST' else {}
 op=req.url.rsplit('/',1)[-1] if '/rest/v1/rpc/' in req.url else body.get('operation')
 result=None
 if op=='fti_catalog_raw_orders':result=[material]
 elif op=='fti_catalog_fastener_orders':result=[fastener]
 elif op=='fti_catalog_raw_delivery_replay':retries.append(body);result=None
 else:return original_api(route)
 if '/functions/' in req.url:result={'data':result}
 route.fulfill(status=200,content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 for width in [390,1366]:
  context=browser.new_context(viewport={'width':width,'height':1100})
  context.route('https://*.supabase.co/**',api)
  context.add_init_script('localStorage.setItem("fti-auth-v2", '+json.dumps(json.dumps(session))+')')
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8087/admin?section=raw-material-orders')
  expect(page.get_by_text('FTI-RM-REVIEW',exact=True)).to_be_visible(timeout=30000)
  expect(page.get_by_text('Buyer & delivery',exact=True)).to_be_visible()
  expect(page.get_by_label('Recipient name',exact=True)).to_have_count(0)
  page.get_by_role('button',name='View notification details',exact=True).click()
  page.get_by_role('button',name='Review failed delivery',exact=True).click()
  expect(page.get_by_role('button',name='Confirm not delivered and retry',exact=True)).to_be_visible()
  assert len(retries)==0
  page.get_by_role('button',name='Cancel retry',exact=True).click()
  page.get_by_role('button',name='Hide notification details',exact=True).click()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.screenshot(path=f'artifacts/admin-materials-{width}.png',full_page=True)
  page.get_by_role('tab',name='Fasteners',exact=True).click()
  expect(page.get_by_text('FTI-FS-REVIEW',exact=True)).to_be_visible()
  expect(page.get_by_text('FTI-RM-REVIEW',exact=True)).to_have_count(0)
  page.get_by_role('button',name='View drawing & notifications',exact=True).click()
  expect(page.get_by_text('Drawing preview',exact=True)).to_be_visible()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.screenshot(path=f'artifacts/admin-fasteners-{width}.png',full_page=True)
  page.get_by_role('tab',name='Notification settings',exact=True).click()
  expect(page.get_by_label('Recipient name',exact=True)).to_be_visible()
  page.get_by_role('button',name='Add notification number',exact=True).click()
  expect(page.get_by_role('button',name='Remove Test Buyer',exact=True)).to_be_visible()
  page.get_by_role('tab',name='Materials',exact=True).click()
  expect(page.get_by_text('FTI-RM-REVIEW',exact=True)).to_be_visible()
  context.close()
 assert not errors,errors
 browser.close()
print('PASS: mobile/desktop tabs, structured requests, drawing, guarded retry, recipient save, no overflow or runtime errors')
