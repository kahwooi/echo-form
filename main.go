package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/nats-io/nats.go"
)

type ResidentRegisterForm struct {
	ResidentName            string                    `json:"residentName" validate:"required,min=3,max=50"`
	ContactNumber           string                    `json:"contactNumber" validate:"required,min=2,max=10"`
	ContactEmail            string                    `json:"contactEmail" validate:"required,email"`
	ResidentAddressLine1    string                    `json:"residentAddressLine1" validate:"required,min=5,max=100"`
	ResidentAddressLine2    string                    `json:"residentAddressLine2,omitempty" validate:"max=100"` // optional
	PlateNumber             string                    `json:"plateNumber" validate:"required"`
	VehicleType             string                    `json:"vehicleType" validate:"required"`
	ResidentPlates          ResidentPlates            `json:"residentPlate"`
	ResidentSupportingFiles []ResidentSupportingFiles `json:"residentSupportingFiles"`
}

type ResidentPlates struct {
	PlateNumber string `json:"plateNumber"`
	VehicleType string `json:"vehicleType"`
	FileKey     string `json:"fileKey"`
}

type ResidentSupportingFiles struct {
	FileKey string `json:"fileKey"`
}

type CompanyRegisterForm struct {
	CompayRegistrationNumber string                   `json:"companyRegistrationNumber"`
	TaxIdentificationNumber  string                   `json:"taxIdentificationNumber"`
	CompanyName              string                   `json:"companyName"`
	ContactPerson            string                   `json:"contactPerson"`
	ContactNumber            string                   `json:"contactNumber"`
	ContactEmail             string                   `json:"contactEmail" validate:"required,email"`
	CompanyAddressLine1      string                   `json:"companyAddressLine1" validate:"required,min=5,max=100"`
	CompanyAddressLine2      string                   `json:"companyAddressLine2" validate:"max=100"`
	CompanyPlates            []CompanyPlates          `json:"companyPlates"`
	CompanySupportingFiles   []CompanySupportingFiles `json:"companySupportingFiles"`
}

type CompanyPlates struct {
	PlateNumber string `json:"plateNumber"`
	VehicleType string `json:"vehicleType"`
	FileKey     string `json:"fileKey"`
}

type CompanySupportingFiles struct {
	FileKey string `json:"fileKey"`
}

func main() {
	loadEnv()
	initNATS()
	defer natsConn.Close()

	e := echo.New()

	e.Validator = NewValidator()

	e.Use(middleware.CORS())

	e.GET("/config", handleConfig)

	e.GET("/presigned", handleGetPresignedURL)

	e.GET("/presigned/download", handleGetPresignedDownloadURL)

	e.POST("/registers/resident", handleCreateResidentRegister)

	e.POST("/registers/resident/finalize", handleCreateResidentRegisterFinalize)

	e.POST("/registers/company", handleCreateCompanyRegister)

	e.POST("/registers/company/finalize", handleCreateCompanyRegisterFinalize)

	e.POST("/registers/company/:id/plates/:plateNumber", handleUplaodCompanyPlateFile)

	e.POST("/registers/company/:id/general", handleUploadCompanyGeneralFile)

	e.Logger.Fatal(e.Start(":8080"))
}

func loadEnv() {
	err := godotenv.Load()
	if err != nil {
		log.Printf("No .env file found, using system environment variables")
	}
}

var natsConn *nats.Conn

func initNATS() {
	natsURL := os.Getenv("NATS_URL")
	var err error
	natsConn, err = nats.Connect(natsURL)
	if err != nil {
		log.Fatalf("Failed to connect to NATS: %v", err)
	}
	log.Printf("Connected to NATS at %s", natsURL)
}

func handleConfig(c echo.Context) error {
	return c.JSON(200, map[string]string{
		"maxGeneralFiles":   "2",
		"maxPlateNumbers":   "5",
		"concurrentUploads": "2",
	})
}

func handleGetPresignedDownloadURL(c echo.Context) error {
	endpoint := os.Getenv("OSS_ENDPOINT")
	accessKeyID := os.Getenv("OSS_ACCESS_KEY_ID")
	accessKeySecret := os.Getenv("OSS_ACCESS_KEY_SECRET")
	bucketName := os.Getenv("OSS_BUCKET_NAME")

	objectKey := c.QueryParam("key")

	client, err := oss.New(endpoint, accessKeyID, accessKeySecret)
	if err != nil {
		return c.String(500, fmt.Sprintf("Failed to create OSS client %s", err.Error()))
	}

	bucket, err := client.Bucket(bucketName)
	if err != nil {
		return c.String(500, fmt.Sprintf("Failed to get OSS bucket %s", err.Error()))
	}

	signedUrl, err := bucket.SignURL(objectKey, oss.HTTPGet, 900)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	return c.JSON(200, map[string]string{
		"downloadUrl": signedUrl,
		"key":         objectKey,
	})
}

func handleGetPresignedURL(c echo.Context) error {
	// remoteIP := c.Request().RemoteAddr

	// token := c.QueryParam("turnstileToken")
	// if !validateTurnstile(token, remoteIP) {
	// 	return c.JSON(400, map[string]string{"error": "Invalid captcha"})
	// }

	endpoint := os.Getenv("OSS_ENDPOINT")
	accessKeyID := os.Getenv("OSS_ACCESS_KEY_ID")
	accessKeySecret := os.Getenv("OSS_ACCESS_KEY_SECRET")
	bucketName := os.Getenv("OSS_BUCKET_NAME")

	registerId := c.QueryParam("registerId")
	fileType := c.QueryParam("fileType")
	fileName := c.QueryParam("fileName")
	plateNumber := c.QueryParam("plateNumber")

	contentType := c.QueryParam("contentType")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	client, err := oss.New(endpoint, accessKeyID, accessKeySecret)
	if err != nil {
		return c.String(500, fmt.Sprintf("Failed to create OSS client %s", err.Error()))
	}

	bucket, err := client.Bucket(bucketName)
	if err != nil {
		return c.String(500, fmt.Sprintf("Failed to get OSS bucket %s", err.Error()))
	}

	var objectKey string

	if fileType == "plate" {
		// Example: uploads/{id}/plates/{plate}_{filename}
		objectKey = path.Join("uploads", registerId, "plates", fmt.Sprintf("%s_%s", plateNumber, fileName))
	} else {
		// Example: uploads/{id}/general/{filename}
		objectKey = path.Join("uploads", registerId, "general", fileName)
	}

	signedURL, err := bucket.SignURL(objectKey, oss.HTTPPut, 900, oss.ContentType(contentType))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	return c.JSON(200, map[string]string{
		"url": signedURL,
		"key": objectKey,
	})
}

func handleCreateResidentRegister(c echo.Context) error {
	form := new(ResidentRegisterForm)

	if err := c.Bind(form); err != nil {
		return ErrorResponse(c, 400, "Invalid input format", err.Error())
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return ErrorResponse(c, http.StatusBadRequest, "", he.Message)
		}
		return ErrorResponse(c, http.StatusBadRequest, "Validation failed", err.Error())
	}

	registerId := uuid.New().String()

	return c.JSON(200, map[string]string{"id": registerId})
}

func handleCreateResidentRegisterFinalize(c echo.Context) error {
	form := new(ResidentRegisterForm)

	if err := c.Bind(form); err != nil {
		return ErrorResponse(c, 400, "Invalid input format", err.Error())
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return ErrorResponse(c, http.StatusBadRequest, "", he.Message)
		}
	}

	log.Printf("Bound form: %+v", form)

	log.Printf("plate number: %s = %s = %s \n", form.PlateNumber, form.VehicleType, form.ResidentPlates.FileKey)

	for ind2, generals := range form.ResidentSupportingFiles {
		log.Printf("%d - with general file key: %s \n", ind2, generals.FileKey)
	}

	return SuccessResponse(c, "Registration successful", map[string]string{"id": form.ResidentName})
}

func handleCreateCompanyRegister(c echo.Context) error {
	form := new(CompanyRegisterForm)

	if err := c.Bind(form); err != nil {
		return c.String(400, "Invalid input")
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return ErrorResponse(c, http.StatusBadRequest, "", he.Message)
		}
	}

	registerId := uuid.New().String()

	savePath := filepath.Join("uploads", registerId)
	if err := os.MkdirAll(savePath, 0755); err != nil {
		return c.String(500, "Failed to create register directory")
	}

	log.Printf("Created company name %s path %s", form.CompanyName, registerId)

	for _, plate := range form.CompanyPlates {
		log.Printf(" - with plate number: %s", plate)
	}

	return c.JSON(200, map[string]string{"id": registerId})
}

func handleCreateCompanyRegisterFinalize(c echo.Context) error {
	form := new(CompanyRegisterForm)

	if err := c.Bind(form); err != nil {
		return ErrorResponse(c, 400, "Invalid input format", err.Error())
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return ErrorResponse(c, http.StatusBadRequest, "", he.Message)
		}
	}

	natsPayload := map[string]interface{}{
		"employerName":  form.CompanyName,
		"contactPerson": form.ContactPerson,
		"contactNumber": form.ContactNumber,
		"address1":      form.CompanyAddressLine1,
		"address2":      form.CompanyAddressLine2,
		"companyRegNum": form.CompayRegistrationNumber,
		"tinNumber":     form.TaxIdentificationNumber,
		"email":         form.ContactEmail,
		"individuals":   []map[string]interface{}{},
	}

	for _, plate := range form.CompanyPlates {
		individual := map[string]interface{}{
			"fullName":      form.ContactPerson, // Using contact person as placeholder
			"email":         form.ContactEmail,
			"contactNumber": form.ContactNumber,
			"address1":      form.CompanyAddressLine1,
			"address2":      form.CompanyAddressLine2,
			"nric":          "", // Not available in company form
			"vehicleNum":    plate.PlateNumber,
			"tinNumber":     form.TaxIdentificationNumber,
			"vehicleClass":  plate.VehicleType,
		}
		natsPayload["individuals"] = append(natsPayload["individuals"].([]map[string]interface{}), individual)
	}

	data, err := json.Marshal(natsPayload)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to marshal NATS payload", err.Error())
	}

	natsResponse, err := natsConn.Request("register.employer.0001", data, nats.DefaultTimeout)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to send NATS message", err.Error())
	}

	return SuccessResponse(c, "Registration successful", map[string]interface{}{
		"id":           form.CompayRegistrationNumber,
		"natsResponse": natsResponse,
	})
}

func handleUplaodCompanyPlateFile(c echo.Context) error {
	registerId := c.Param("id")
	plate := c.Param("plateNumber")

	reader, err := c.Request().MultipartReader()
	if err != nil {
		return c.String(400, fmt.Sprintf("Invalid multipart form data %s", err.Error()))
	}

	part, err := reader.NextPart()
	if err == io.EOF {
		return c.String(400, "No file parts found")
	}
	if err != nil {
		return c.String(500, "Failed to read multipart data")
	}

	savePath := filepath.Join("uploads", registerId, "plates")
	os.MkdirAll(savePath, 0755)

	dstPath := filepath.Join(savePath, fmt.Sprintf("%s_%s", plate, part.FileName()))

	dst, err := os.Create(dstPath)
	if err != nil {
		return c.String(500, "Failed to create file on server")
	}
	defer dst.Close()

	written, err := io.Copy(dst, part)
	if err != nil {
		return c.String(500, "Failed to save file on server")
	}

	log.Printf("Saved file %s (%d bytes) to project %s", part.FileName(), written, registerId)

	return c.JSON(http.StatusOK, map[string]string{
		"status":    "success",
		"filename":  part.FileName(),
		"savedPath": savePath,
	})
}

func handleUploadCompanyGeneralFile(c echo.Context) error {
	registerId := c.Param("id")

	reader, err := c.Request().MultipartReader()
	if err != nil {
		return c.String(400, fmt.Sprintf("Invalid multipart form data %s", err.Error()))
	}

	part, err := reader.NextPart()
	if err == io.EOF {
		return c.String(400, "No file parts found")
	}
	if err != nil {
		return c.String(500, "Failed to read multipart data")
	}

	savePath := filepath.Join("uploads", registerId, "general")
	os.MkdirAll(savePath, 0755)

	dstPath := filepath.Join(savePath, part.FileName())

	dst, err := os.Create(dstPath)
	if err != nil {
		return c.String(500, "Failed to create file on server")
	}
	defer dst.Close()

	written, err := io.Copy(dst, part)
	if err != nil {
		return c.String(500, "Failed to save file on server")
	}

	log.Printf("Saved file %s (%d bytes) to project %s", part.FileName(), written, registerId)

	return c.JSON(http.StatusOK, map[string]string{
		"status":   "success",
		"filename": part.FileName(),
	})
}

func validateTurnstile(token string, remoteIP string) bool {
	secrectKey := os.Getenv("TURNSTILE_SECRET_KEY")
	if secrectKey == "" {
		log.Printf("TURNSTILE_SECRET_KEY not set, skipping turnstile validation")
		return false
	}

	data := url.Values{}
	data.Set("secret", secrectKey)
	data.Set("response", token)
	data.Set("remoteip", remoteIP)

	resp, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", data)
	if err != nil {
		log.Printf("Failed to validate turnstile token %s", err.Error())
		return false
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	log.Printf("Turnstile raw response: %s", string(bodyBytes))

	var result struct {
		Success     bool     `json:"success"`
		ChallengeTS string   `json:"challenge_ts"`
		Hostname    string   `json:"hostname"`
		ErrorCodes  []string `json:"error-codes"`
	}

	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		log.Printf("Failed to decode Turnstile response: %v", err)
		return false
	}

	if !result.Success {
		log.Printf("Turnstile failed with errors: %v", result.ErrorCodes)
	}

	return result.Success
}
