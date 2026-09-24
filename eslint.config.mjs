import tseslint from 'typescript-eslint';
export default [
 {ignores:['dist/**','node_modules/**','coverage/**']},
 {
  files:['src/**/*.ts','migrations/**/*.ts','test/**/*.ts'],
  languageOptions:{parser:tseslint.parser,parserOptions:{ecmaVersion:'latest',sourceType:'module'}},
  plugins:{'@typescript-eslint':tseslint.plugin},
  rules:{
   'no-debugger':'error','no-constant-condition':['error',{checkLoops:false}],
   'no-duplicate-case':'error','no-unreachable':'error','constructor-super':'error',
   'no-unsafe-finally':'error','no-async-promise-executor':'error',
   '@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrors:'none',ignoreRestSiblings:true}],
   '@typescript-eslint/consistent-type-imports':'off'
  }
 }
];
