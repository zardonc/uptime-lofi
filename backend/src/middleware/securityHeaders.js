export const securityHeadersMiddleware = async (c, next) => {
    const res = await next(c);
    // Ensure response exists
    if (!res || typeof res.headers === 'undefined') {
        return res;
    }
    // Standard security headers
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('X-XSS-Protection', '1; mode=block');
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy: limit resources by default
    res.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none';");
    // Permissions-Policy: disable all features by default
    res.headers.set('Permissions-Policy', "accelerometer=(), camera=(), clipboard-read=(), clipboard-write=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), fullscreen=()");
    return res;
};
