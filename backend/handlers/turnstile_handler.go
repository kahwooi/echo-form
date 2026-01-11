package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"maxpark_opp_registration/utils"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
)

// TurnstileHandler manages Turnstile validation and JWT token generation
type TurnstileHandler struct {
	jwtSecret       []byte
	turnstileSecret string
	tokenCache      sync.Map
}

// NewTurnstileHandler creates a new handler with secrets from environment
func NewTurnstileHandler() *TurnstileHandler {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "your-default-jwt-secret-change-in-production"
		log.Println("WARNING: Using default JWT secret. Set JWT_SECRET env var in production.")
	}

	turnstileSecret := os.Getenv("TURNSTILE_SECRET_KEY")
	if turnstileSecret == "" {
		log.Println("WARNING: TURNSTILE_SECRET_KEY not set. Turnstile validation will fail.")
	}

	return &TurnstileHandler{
		jwtSecret:       []byte(jwtSecret),
		turnstileSecret: turnstileSecret,
	}
}

// TurnstileResponse represents Cloudflare Turnstile API response
type TurnstileResponse struct {
	Success     bool     `json:"success"`
	ChallengeTS string   `json:"challenge_ts"`
	Hostname    string   `json:"hostname"`
	ErrorCodes  []string `json:"error-codes"`
}

// UploadTokenRequest represents request to generate upload token
type UploadTokenRequest struct {
	TurnstileToken string `json:"turnstileToken" form:"turnstileToken"`
}

// UploadTokenResponse represents response with JWT upload token
type UploadTokenResponse struct {
	UploadToken string `json:"uploadToken"`
	ExpiresIn   int64  `json:"expiresIn"` // seconds
}

// ValidateTurnstile validates a Turnstile token with Cloudflare API
func (h *TurnstileHandler) ValidateTurnstile(token, remoteIP string) bool {
	if h.turnstileSecret == "" {
		log.Printf("TURNSTILE_SECRET_KEY not set, skipping validation")
		return false
	}

	if token == "" {
		log.Printf("Empty Turnstile token")
		return false
	}

	// Check cache first
	if cached, ok := h.tokenCache.Load(token); ok {
		return cached.(bool)
	}

	// Call Cloudflare API
	data := url.Values{}
	data.Set("secret", h.turnstileSecret)
	data.Set("response", token)
	data.Set("remoteip", remoteIP)

	resp, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", data)
	if err != nil {
		log.Printf("Failed to validate Turnstile token: %v", err)
		return false
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)

	var result TurnstileResponse
	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		log.Printf("Failed to decode Turnstile response: %v", err)
		return false
	}

	if !result.Success {
		log.Printf("Turnstile validation failed. Errors: %v", result.ErrorCodes)
	}

	// Cache successful validations only
	if result.Success {
		h.tokenCache.Store(token, true)

		// Auto-expire cache after 15 minutes (Turnstile token lifetime)
		time.AfterFunc(15*time.Minute, func() {
			h.tokenCache.Delete(token)
		})
	}

	return result.Success
}

// GenerateUploadToken generates a JWT token after successful Turnstile validation
func (h *TurnstileHandler) GenerateUploadToken(turnstileToken string) (string, int64, error) {
	expiresAt := time.Now().Add(15 * time.Minute).Unix()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"turnstile_token": turnstileToken,
		"exp":             expiresAt,
		"iat":             time.Now().Unix(),
		"type":            "upload_token",
		"jti":             fmt.Sprintf("upload_%d", time.Now().UnixNano()), // Unique JWT ID
	})

	tokenString, err := token.SignedString(h.jwtSecret)
	if err != nil {
		return "", 0, fmt.Errorf("failed to sign JWT token: %w", err)
	}

	return tokenString, expiresAt, nil
}

// ValidateUploadToken validates a JWT upload token
func (h *TurnstileHandler) ValidateUploadToken(uploadToken string) (bool, string) {
	if uploadToken == "" {
		return false, ""
	}

	token, err := jwt.Parse(uploadToken, func(token *jwt.Token) (interface{}, error) {
		// Validate the signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return h.jwtSecret, nil
	})

	if err != nil || !token.Valid {
		log.Printf("Invalid JWT token: %v", err)
		return false, ""
	}

	// Verify it's an upload token
	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		// Check token type
		if tokenType, ok := claims["type"].(string); !ok || tokenType != "upload_token" {
			log.Printf("Invalid token type: %v", tokenType)
			return false, ""
		}

		// Check expiration
		if exp, ok := claims["exp"].(float64); ok {
			if time.Now().Unix() > int64(exp) {
				log.Printf("Token expired")
				return false, ""
			}
		}

		// Extract original Turnstile token if needed
		if turnstileToken, ok := claims["turnstile_token"].(string); ok {
			return true, turnstileToken
		}
	}

	return false, ""
}

// HandleGenerateUploadToken is the HTTP handler for generating upload tokens
func (h *TurnstileHandler) HandleGenerateUploadToken(c echo.Context) error {
	var req UploadTokenRequest
	if err := c.Bind(&req); err != nil {
		return utils.ErrorResponse(c, 400, "Invalid request format", err.Error())
	}

	if req.TurnstileToken == "" {
		return utils.ErrorResponse(c, 400, "Turnstile token is required", nil)
	}

	// Validate Turnstile token (only once per session)
	remoteIP := c.Request().RemoteAddr
	if !h.ValidateTurnstile(req.TurnstileToken, remoteIP) {
		return utils.ErrorResponse(c, 400, "Invalid Turnstile token", nil)
	}

	// Generate JWT upload token
	uploadToken, expiresAt, err := h.GenerateUploadToken(req.TurnstileToken)
	if err != nil {
		return utils.ErrorResponse(c, 500, "Failed to generate upload token", err.Error())
	}

	// Calculate expires in seconds
	expiresIn := expiresAt - time.Now().Unix()

	return utils.SuccessResponse(c, "Upload token generated successfully", UploadTokenResponse{
		UploadToken: uploadToken,
		ExpiresIn:   expiresIn,
	})
}

// UploadTokenMiddleware is Echo middleware to validate upload token in requests
func (h *TurnstileHandler) UploadTokenMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Try to get token from query parameter
		uploadToken := c.QueryParam("uploadToken")
		if uploadToken == "" {
			// Try to get from Authorization header as fallback
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader != "" && len(authHeader) > 7 && authHeader[:7] == "Bearer " {
				uploadToken = authHeader[7:]
			}
		}

		if uploadToken == "" {
			return utils.ErrorResponse(c, 401, "Upload token is required", nil)
		}

		// Validate the JWT token
		isValid, _ := h.ValidateUploadToken(uploadToken)
		if !isValid {
			return utils.ErrorResponse(c, 401, "Invalid or expired upload token", nil)
		}

		// Token is valid, proceed to next handler
		return next(c)
	}
}

// GetUploadTokenFromRequest extracts upload token from various sources in the request
func (h *TurnstileHandler) GetUploadTokenFromRequest(c echo.Context) string {
	// 1. Try query parameter
	if token := c.QueryParam("uploadToken"); token != "" {
		return token
	}

	// 2. Try form value
	if token := c.FormValue("uploadToken"); token != "" {
		return token
	}

	// 3. Try Authorization header
	authHeader := c.Request().Header.Get("Authorization")
	if authHeader != "" && len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		return authHeader[7:]
	}

	// 4. Try cookie
	cookie, err := c.Cookie("upload_token")
	if err == nil && cookie.Value != "" {
		return cookie.Value
	}

	return ""
}
