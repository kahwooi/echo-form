package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                      string
	NATSUrl                   string
	OSSEndpoint               string
	OSSAccessKeyID            string
	OSSAccessKeySecret        string
	OSSBucketName             string
	TurnstileSecretKey        string
	RegisterIndividualSubject string
	RegisterEmployerSubject   string
	RegisterEmployerIDSubject string
	SiteCode                  string
	JWTSecretKey              string
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Printf("No .env file found, using system environment variables")
	}

	return &Config{
		Port:                      getEnv("PORT", "8081"),
		NATSUrl:                   getEnv("NATS_URL", ""),
		OSSEndpoint:               getEnv("OSS_ENDPOINT", ""),
		OSSAccessKeyID:            getEnv("OSS_ACCESS_KEY_ID", ""),
		OSSAccessKeySecret:        getEnv("OSS_ACCESS_KEY_SECRET", ""),
		OSSBucketName:             getEnv("OSS_BUCKET_NAME", ""),
		TurnstileSecretKey:        getEnv("TURNSTILE_SECRET_KEY", ""),
		RegisterIndividualSubject: getEnv("REGISTER_INDIVIDUAL_SUBJECT", ""),
		RegisterEmployerSubject:   getEnv("REGISTER_EMPLOYER_SUBJECT", ""),
		RegisterEmployerIDSubject: getEnv("REGISTER_EMPLOYER_ID_SUBJECT", ""),
		SiteCode:                  getEnv("SITE_CODE", ""),
		JWTSecretKey:              getEnv("JWT_SECRET_KEY", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
