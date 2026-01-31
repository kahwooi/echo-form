package main

import (
	"log"

	"maxpark_opp_registration/config"
	"maxpark_opp_registration/handlers"
	"maxpark_opp_registration/services"
	"maxpark_opp_registration/utils"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	cfg := config.Load()

	natsService, err := services.NewNATSService(cfg.NATSUrl)
	if err != nil {
		log.Fatalf("Failed to connect to NATS: %v", err)
	}
	defer natsService.Close()

	ossService, err := services.NewOSSService(cfg.OSSEndpoint, cfg.OSSAccessKeyID, cfg.OSSAccessKeySecret, cfg.OSSBucketName)
	if err != nil {
		log.Fatalf("Failed to create OSS service: %v", err)
	}

	e := echo.New()
	e.Validator = utils.NewValidator()
	e.Use(middleware.CORS())

	// Initialize handlers
	presignedHandler := handlers.NewPresignedHandler(ossService)
	residentHandler := handlers.NewResidentHandler(natsService, cfg)
	companyHandler := handlers.NewCompanyHandler(natsService, cfg)
	turnstileHandler := handlers.NewTurnstileHandler()

	// Routes
	e.GET("/config", handlers.HandleConfig)
	e.POST("/upload-token", turnstileHandler.HandleGenerateUploadToken)
	presignedUploadGroup := e.Group("")
	presignedUploadGroup.Use(turnstileHandler.UploadTokenMiddleware)
	presignedUploadGroup.GET("/presigned", presignedHandler.HandleGetPresignedURL)
	e.GET("/presigned/download", presignedHandler.HandleGetPresignedDownloadURL)
	e.POST("/registers/resident", residentHandler.HandleCreateResidentRegister)
	e.POST("/registers/resident/finalize", residentHandler.HandleCreateResidentRegisterFinalize)
	e.POST("/registers/company", companyHandler.HandleCreateCompanyRegister)
	e.POST("/registers/company/finalize", companyHandler.HandleCreateCompanyRegisterFinalize)
	e.POST("/registers/company/:id/plates/:plateNumber", handlers.HandleUploadCompanyPlateFile)
	e.POST("/registers/company/:id/general", handlers.HandleUploadCompanyGeneralFile)

	e.Logger.Fatal(e.Start(":" + cfg.Port))
}
