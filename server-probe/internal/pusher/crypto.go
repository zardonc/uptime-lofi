package pusher

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// GenerateSignature generates HMAC-SHA256 matching the Cloudflare Worker WebCrypto signature logic.
// Edge expects: HMAC(SHA256, PSK, "{timestamp}.{stringified_body}")
func GenerateSignature(psk string, timestamp int64, rawBody []byte) string {
	msg := fmt.Sprintf("%d.%s", timestamp, string(rawBody))
	h := hmac.New(sha256.New, []byte(psk))
	h.Write([]byte(msg))
	return hex.EncodeToString(h.Sum(nil))
}
