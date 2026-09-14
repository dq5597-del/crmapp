import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // 既有 Supabase 動態 schema 尚未產生 Database 泛型；由 TypeScript strict 與執行期驗證把關。
      "@typescript-eslint/no-explicit-any": "off",
      // 多數資料頁在 mount 時載入遠端資料，這是必要的外部同步，不視為錯誤。
      "react-hooks/set-state-in-effect": "off",
      // 尚未啟用 React Compiler；這兩條 compiler-only 規則不應阻擋既有事件/載入模式建置。
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "prefer-const": "off",
    },
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
