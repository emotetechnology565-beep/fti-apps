export function loginReturnPath(value: unknown): '/products' | '/account' {
  return value === 'material-selection' ? '/products' : '/account';
}
