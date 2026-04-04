declare module "*.css";

declare module "@build-info" {
  type BuildInfo = {
    name: string;
    description: string;
    version: string | undefined;
    build: string;
    author: string;
    license: string;
  };

  const info: BuildInfo;
  export default info;
}
