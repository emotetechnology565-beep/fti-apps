export function loginReturnPath(value: unknown): '/products' | '/account' | '/checkout' | '/rfqs' {
  if (value === 'checkout') return '/checkout';
  if (value === 'requirements') return '/rfqs';
  return value === 'material-selection' ? '/products' : '/account';
}
