// Type augmentation for Hono Context to expose JWT payload on the request
declare module "hono" {
  interface Context {
    // Optional JWT payload decoded from the Authorization header
    jwtPayload?: any;
  }
}
