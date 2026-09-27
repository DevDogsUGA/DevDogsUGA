// Vite's `?raw` import suffix (see src/server/github/queries/index.ts)
// replaces Turbopack's `.gql`/`.graphql` raw-loader rule -- these declare
// what that suffixed specifier resolves to for TypeScript, the same way the
// unsuffixed declarations below covered the old loader-rewritten import.
declare module "*.graphql?raw" {
  const Query: string;
  export default Query;
}

declare module "*.gql?raw" {
  const Query: string;
  export default Query;
}
