// Type augmentation for Hono Context to expose JWT payload on the request

export interface JwtPayload {
	session_id: string;
	role: string;
	exp: number;
	aud?: string;
	iss?: string;
}

declare module "hono" {
	interface ContextVariableMap {
		jwtPayload?: JwtPayload;
	}
}
