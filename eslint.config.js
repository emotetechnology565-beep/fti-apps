const {defineConfig} = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
 expoConfig,
 {ignores:['dist/**','dist-native/**','scripts/**']},
 {files:['tests/**/*-db.test.ts'],settings:{'import/ignore':['@electric-sql.*pglite']},rules:{'import/namespace':'off'}},
 {
  files:['src/shared/**/*.{ts,tsx}'],
  rules:{'no-restricted-imports':['error',{patterns:[{group:['@features/*','@core/*'],message:'Shared code must not depend on business features or application wiring.'}]}]},
 },
 {
  files:['src/features/**/model/**/*.ts','src/shared/lib/**/*.ts'],
  rules:{'no-restricted-imports':['error',{patterns:[{group:['react','react-native','expo-*','@shared/ui','@core/state/workspace-store'],message:'Domain models must remain independent of rendering and native adapters.'}]}]},
 },
]);
