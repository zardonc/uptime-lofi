import { jwt } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
export const dashboardAuthMiddleware = async (c, next) => {
    const secret = c.env.API_SECRET_KEY;
    if (!secret) {
        throw new HTTPException(500, { message: "API_SECRET_KEY is not configured on the edge" });
    }
    const jwtMiddleware = jwt({
        secret,
        alg: "HS256",
    });
    return jwtMiddleware(c, next);
};
