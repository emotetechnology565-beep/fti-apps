"""Local UI tests. Supabase requests are intercepted; no OTP or remote records are created."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import argparse, json, time, base64
parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8082)
base=f'http://127.0.0.1:{parser.parse_args().port}'
out=Path(__file__).resolve().parents[1]/'test-results';out.mkdir(exist_ok=True)
errors=[];checks=[];operations=[]
actor='00000000-0000-0000-0000-000000000001'
identity={'profile':{'id':actor,'full_name':'','phone':'919000000001','account_status':'active'},'roles':[],'permissions':[],'businesses':[],'deletion_requested':False}
def jwt():
 def enc(data):return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')
 return enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':actor,'role':'authenticated','aud':'authenticated','aal':'aal1','iat':int(time.time()),'exp':int(time.time())+3600})+'.isolated-test-signature'
def fulfill(route,data,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'})
def api(route):
 req=route.request
 if req.method=='OPTIONS':fulfill(route,{});return
 if '/auth/v1/' in req.url:
  if '/otp' in req.url:fulfill(route,{});return
  if '/verify' in req.url:
   fulfill(route,{'access_token':jwt(),'refresh_token':'isolated-refresh-token','token_type':'bearer','expires_in':3600,'user':{'id':actor,'aud':'authenticated','role':'authenticated','phone':'919000000001','phone_confirmed_at':'2026-10-15T00:00:00Z','app_metadata':{'provider':'phone'},'user_metadata':{'role':'super_admin'}}});return
  if '/logout' in req.url:fulfill(route,{});return
  fulfill(route,{'message':'Unexpected auth request in isolated test'},400);return
 if '/functions/v1/identity' in req.url:
  body=req.post_data_json;op=body['operation'];args=body['arguments'];operations.append(op)
  if op=='fti_identity_me':fulfill(route,{'data':identity});return
  if op=='fti_save_profile':identity['profile']['full_name']=args['p_full_name'];fulfill(route,{'data':None});return
  if op=='fti_apply_business':
   app=args['p_application'];identity['businesses']=[{**app,'id':'isolated-business','submitted_by':actor,'verification_status':'pending','revision':1,'review_note':None,'addresses':[dict(app['billing'],label='billing'),dict(app['shipping'],label='shipping')]}];fulfill(route,{'data':'isolated-business'});return
  if op=='fti_request_account_deletion':identity['deletion_requested']=True;fulfill(route,{'data':None});return
 fulfill(route,{'message':'Unexpected external request blocked'},400)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1440,'height':1080})
 context.route('https://*.supabase.co/**',api)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);expect(page.get_by_text('Welcome to FTI.',exact=True)).to_be_visible()
 page.screenshot(path=str(out/'home-desktop.png'),full_page=True)
 for route,message in [('products','No materials available'),('rates','No published rates available'),('cart','Your cart is empty'),('account','Sign in to continue'),('orders','Sign in to continue'),('rfqs','Sign in to continue'),('payments','Sign in to continue'),('admin','Sign in to continue')]:
  page.goto(base+'/'+route);expect(page.get_by_text(message,exact=True)).to_be_visible()
 checks.append('guest public routes and protected account/staff routes')
 page.goto(base+'/login');expect(page.get_by_text('Your business starts here.',exact=True)).to_be_visible()
 expect(page.get_by_role('button',name='Send WhatsApp code',exact=True)).to_be_disabled()
 page.get_by_role('button',name='Send my verification code on WhatsApp',exact=True).click()
 page.get_by_role('button',name='Send WhatsApp code',exact=True).click()
 expect(page.get_by_text('Enter your WhatsApp number with +91 and ten digits.',exact=True)).to_be_visible()
 checks.append('WhatsApp consent and phone validation')
 page.get_by_role('textbox',name='WhatsApp number with country code',exact=True).fill('+919000000001')
 page.get_by_role('button',name='Send WhatsApp code',exact=True).click()
 expect(page.get_by_text('Check WhatsApp for your verification code.',exact=True)).to_be_visible()
 expect(page.get_by_role('button',name='Resend in',exact=False)).to_be_disabled()
 page.get_by_role('textbox',name='Six-digit WhatsApp code',exact=True).fill('123456')
 page.get_by_role('button',name='Verify and sign in',exact=True).click()
 expect(page.get_by_role('textbox',name='Full name',exact=True)).to_be_visible()
 checks.append('OTP UI and authenticated session (intercepted responses)')
 page.get_by_role('textbox',name='Full name',exact=True).fill('Browser verification actor')
 page.get_by_role('button',name='Save profile',exact=True).click()
 expect(page.get_by_text('Profile saved.',exact=True)).to_be_visible()
 page.get_by_role('textbox',name='Legal business name',exact=True).fill('Isolated browser application')
 for field,value in [('address','Isolated test address'),('city','Test city'),('state','Test state'),('pincode','100001')]:page.get_by_role('textbox',name='Billing '+field,exact=True).fill(value)
 page.get_by_role('button',name='I confirm these details are accurate and authorize verification',exact=True).click()
 page.get_by_role('button',name='Submit business application',exact=True).click()
 expect(page.get_by_text('PENDING',exact=True)).to_be_visible()
 page.reload();expect(page.get_by_role('textbox',name='Full name',exact=True)).to_have_value('Browser verification actor')
 expect(page.get_by_text('PENDING',exact=True)).to_be_visible()
 checks.append('profile and business submission; session restoration')
 page.goto(base+'/admin');expect(page.get_by_text('Access restricted',exact=True)).to_be_visible()
 assert 'fti_review_queue' not in operations, 'Buyer must not request staff records'
 checks.append('staff role spoofing through user metadata denied by UI')
 page.goto(base+'/rfqs');page.get_by_role('button',name='New request',exact=True).click()
 page.get_by_role('textbox',name='Material, grade and dimensions',exact=True).fill('Private browser draft')
 page.get_by_role('textbox',name='Required quantity and unit',exact=True).fill('1 kg')
 page.get_by_role('button',name='Save request draft',exact=True).click()
 expect(page.get_by_text('Private browser draft',exact=True)).to_be_visible()
 page.goto(base+'/account');page.get_by_role('button',name='Sign out on this device',exact=True).click()
 expect(page.get_by_text('Sign in to continue',exact=True)).to_be_visible()
 page.goto(base+'/rfqs');expect(page.get_by_text('Sign in to continue',exact=True)).to_be_visible()
 expect(page.get_by_text('Private browser draft',exact=True)).to_have_count(0)
 checks.append('logout clears account access and hides private drafts')
 page.goto(base+'/calculator');page.get_by_role('textbox',name='Diameter (mm)',exact=True).fill('12');page.get_by_role('textbox',name='Length (m)',exact=True).fill('12');page.get_by_role('textbox',name='Number of pieces',exact=True).fill('100');expect(page.get_by_text('1,065.38',exact=False)).to_be_visible()
 checks.append('calculator regression')
 phone=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);phone.route('https://*.supabase.co/**',api)
 mobile=phone.new_page();mobile.on('pageerror',lambda e:errors.append(str(e)));mobile.goto(base)
 expect(mobile.get_by_role('link',name='Home',exact=True)).to_be_visible()
 assert mobile.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
 mobile.screenshot(path=str(out/'home-mobile.png'),full_page=True)
 mobile.get_by_role('button',name='Open navigation',exact=True).click();mobile.get_by_role('link',name='Weight calculator',exact=True).click();expect(mobile.get_by_text('Material weight calculator',exact=True)).to_be_visible()
 mobile.goto(base+'/login');expect(mobile.get_by_role('button',name='Send WhatsApp code',exact=True)).to_be_visible()
 assert mobile.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
 mobile.screenshot(path=str(out/'whatsapp-login-mobile.png'),full_page=True)
 checks.append('mobile navigation and WhatsApp layout')
 browser.close()
assert not errors,errors
(out/'phase2-browser-results.json').write_text(json.dumps({'passed':True,'mode':'isolated intercepted API; no external messages or records','checks':checks,'runtime_errors':errors},indent=2))
print('All Phase 2 browser checks passed:',len(checks))
