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
	"time"

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
	NricNumber              string                    `json:"nric,omitempty"`      // optional
	TinNumber               string                    `json:"tinNumber,omitempty"` // optional
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
	EmployerID               string                 `json:"employerID"`
	CompayRegistrationNumber string                 `json:"companyRegistrationNumber"`
	TinNumber                string                 `json:"tinNumber"`
	CompanyName              string                 `json:"companyName"`
	ContactPerson            string                 `json:"contactPerson"`
	ContactNumber            string                 `json:"contactNumber"`
	ContactEmail             string                 `json:"contactEmail" validate:"required,email"`
	CompanyAddressLine1      string                 `json:"companyAddressLine1" validate:"required,min=5,max=100"`
	CompanyAddressLine2      string                 `json:"companyAddressLine2" validate:"max=100"`
	CompanyPlates            []CompanyPlates        `json:"companyPlates"`
	CompanySupportingFiles   CompanySupportingFiles `json:"companySupportingFiles"`
}

type CompanyPlates struct {
	NricNumber          string `json:"nricNumber"`
	PlateNumber         string `json:"plateNumber"`
	VehicleType         string `json:"vehicleType"`
	SPAPath             string `json:"spaPath"`
	ElectricityBillPath string `json:"electricityBillPath"`
	VehiclePath         string `json:"vehiclePath"`
}

type CompanySupportingFiles struct {
	SSMPath             string `json:"ssmPath"`
	ElectricityBillPath string `json:"electricityBillPath"`
	VehiclePath         string `json:"vehiclePath"`
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

	e.Logger.Fatal(e.Start(":8081"))
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
	configData := map[string]string{
		"maxGeneralFiles":   "2",
		"maxPlateNumbers":   "5",
		"concurrentUploads": "2",
	}
	return SuccessResponse(c, "Configuration retrieved successfully", configData)
}

func handleGetPresignedDownloadURL(c echo.Context) error {
	endpoint := os.Getenv("OSS_ENDPOINT")
	accessKeyID := os.Getenv("OSS_ACCESS_KEY_ID")
	accessKeySecret := os.Getenv("OSS_ACCESS_KEY_SECRET")
	bucketName := os.Getenv("OSS_BUCKET_NAME")

	objectKey := c.QueryParam("key")

	client, err := oss.New(endpoint, accessKeyID, accessKeySecret)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to create OSS client", err.Error())
	}

	bucket, err := client.Bucket(bucketName)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to get OSS bucket", err.Error())
	}

	signedUrl, err := bucket.SignURL(objectKey, oss.HTTPGet, 900)
	if err != nil {
		return ErrorResponse(c, http.StatusInternalServerError, "Failed to generate signed URL", err.Error())
	}

	responseData := map[string]string{
		"downloadUrl": signedUrl,
		"key":         objectKey,
	}
	return SuccessResponse(c, "Download URL generated successfully", responseData)
}

func handleGetPresignedURL(c echo.Context) error {
	// remoteIP := c.Request().RemoteAddr

	// token := c.QueryParam("turnstileToken")
	// if !validateTurnstile(token, remoteIP) {
	// 	return ErrorResponse(c, 400, "Invalid captcha", nil)
	// }

	endpoint := os.Getenv("OSS_ENDPOINT")
	accessKeyID := os.Getenv("OSS_ACCESS_KEY_ID")
	accessKeySecret := os.Getenv("OSS_ACCESS_KEY_SECRET")
	bucketName := os.Getenv("OSS_BUCKET_NAME")

	registerId := c.QueryParam("registerId")
	fileType := c.QueryParam("fileType")
	fileName := c.QueryParam("fileName")
	employerId := c.QueryParam("employerId")
	plateNumber := c.QueryParam("plateNumber")

	contentType := c.QueryParam("contentType")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	client, err := oss.New(endpoint, accessKeyID, accessKeySecret)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to create OSS client", err.Error())
	}

	bucket, err := client.Bucket(bucketName)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to get OSS bucket", err.Error())
	}

	var objectKey string

	switch fileType {
	case "plate":
		objectKey = path.Join("uploads", registerId, "plates", fmt.Sprintf("%s_%s", plateNumber, fileName))
	case "general":
		objectKey = path.Join("uploads", registerId, "general", fmt.Sprintf("%s_%s", employerId, fileName))
	default:
		return ErrorResponse(c, 400, "Invalid fileType", "fileType must be either 'plate' or 'general'")
	}

	signedURL, err := bucket.SignURL(objectKey, oss.HTTPPut, 900, oss.ContentType(contentType))
	if err != nil {
		return ErrorResponse(c, http.StatusInternalServerError, "Failed to generate signed URL", err.Error())
	}

	responseData := map[string]string{
		"url": signedURL,
		"key": objectKey,
	}
	return SuccessResponse(c, "Presigned URL generated successfully", responseData)
}

func handleCreateResidentRegister(c echo.Context) error {
	form := new(ResidentRegisterForm)

	if err := c.Bind(form); err != nil {
		return ErrorResponse(c, 400, "Invalid input format", err.Error())
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return ErrorResponse(c, http.StatusBadRequest, "Validation failed", he.Message)
		}
		return ErrorResponse(c, http.StatusBadRequest, "Validation failed", err.Error())
	}

	registerID := uuid.New().String()

	responseData := map[string]string{
		"registerID": registerID,
	}

	return SuccessResponse(c, "Resident registration form validated successfully", responseData)
}

func handleCreateResidentRegisterFinalize(c echo.Context) error {
	form := new(ResidentRegisterForm)

	if err := c.Bind(form); err != nil {
		return ErrorResponse(c, 400, "Invalid input format", err.Error())
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return ErrorResponse(c, http.StatusBadRequest, "Validation failed", he.Message)
		}
		return ErrorResponse(c, http.StatusBadRequest, "Validation failed", err.Error())
	}

	natsPayload := map[string]interface{}{
		"fullName":      form.ResidentName,
		"email":         form.ContactEmail,
		"contactNumber": form.ContactNumber,
		"address1":      form.ResidentAddressLine1,
		"address2":      form.ResidentAddressLine2,
		"vehicleNum":    form.PlateNumber,
		"vehicleClass":  form.VehicleType,
		"nric":          form.NricNumber,
		"tinNumber":     form.TinNumber,
	}

	data, err := json.Marshal(natsPayload)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to marshal NATS payload", err.Error())
	}

	registerIndividualSubject := os.Getenv("REGISTER_INDIVIDUAL_SUBJECT")
	if registerIndividualSubject == "" {
		return ErrorResponse(c, 500, "Missing REGISTER_INDIVIDUAL_SUBJECT environment variable", nil)
	}

	siteCode := os.Getenv("SITE_CODE")
	if siteCode == "" {
		return ErrorResponse(c, 500, "Missing SITE_CODE environment variable", nil)
	}

	subject := fmt.Sprintf("%s.%s", registerIndividualSubject, siteCode)
	natsResponse, err := natsConn.Request(subject, data, 10*time.Second)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to send NATS message", err.Error())
	}

	var natsResponseData interface{}
	if err := json.Unmarshal(natsResponse.Data, &natsResponseData); err != nil {
		// If we can't unmarshal, return as string
		natsResponseData = string(natsResponse.Data)
	}

	responseData := map[string]interface{}{
		"residentName": form.ResidentName,
		"natsResponse": natsResponseData,
	}
	return SuccessResponse(c, "Resident registration finalized successfully", responseData)
}

func handleCreateCompanyRegister(c echo.Context) error {
	form := new(CompanyRegisterForm)

	if err := c.Bind(form); err != nil {
		return ErrorResponse(c, 400, "Invalid input format", err.Error())
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return ErrorResponse(c, http.StatusBadRequest, "Validation failed", he.Message)
		}
		return ErrorResponse(c, http.StatusBadRequest, "Validation failed", err.Error())
	}

	registerIndividualSubject := os.Getenv("REGISTER_EMPLOYER_ID_SUBJECT")
	if registerIndividualSubject == "" {
		return ErrorResponse(c, 500, "Missing REGISTER_EMPLOYER_ID_SUBJECT environment variable", nil)
	}

	siteCode := os.Getenv("SITE_CODE")
	if siteCode == "" {
		return ErrorResponse(c, 500, "Missing SITE_CODE environment variable", nil)
	}

	subject := fmt.Sprintf("%s.%s", registerIndividualSubject, siteCode)

	natsResponse, err := natsConn.Request(subject, nil, 10*time.Second)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to send NATS message", err.Error())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(natsResponse.Data, &response); err != nil {
		return ErrorResponse(c, 500, "Failed to parse NATS response", err.Error())
	}

	employerID, ok := response["data"].(string)
	if !ok {
		return ErrorResponse(c, 500, "Invalid response format", "Missing or invalid ID")
	}

	log.Printf("Created company name %s path %s", form.CompanyName, employerID)

	for _, plate := range form.CompanyPlates {
		log.Printf(" - with plate number: %s", plate.PlateNumber)
	}

	registerID := uuid.New().String()

	responseData := map[string]string{
		"registerID": registerID,
		"employerID": employerID,
	}

	return SuccessResponse(c, "Company registration initiated successfully", responseData)
}

func handleCreateCompanyRegisterFinalize(c echo.Context) error {
	form := new(CompanyRegisterForm)

	if err := c.Bind(form); err != nil {
		return ErrorResponse(c, 400, "Invalid input format", err.Error())
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return ErrorResponse(c, http.StatusBadRequest, "Validation failed", he.Message)
		}
		return ErrorResponse(c, http.StatusBadRequest, "Validation failed", err.Error())
	}

	natsPayload := map[string]interface{}{
		"employerID":             form.EmployerID,
		"companyRegNum":          form.CompayRegistrationNumber,
		"tinNumber":              form.TinNumber,
		"employerName":           form.CompanyName,
		"contactPerson":          form.ContactPerson,
		"contactNumber":          form.ContactNumber,
		"email":                  form.ContactEmail,
		"address1":               form.CompanyAddressLine1,
		"address2":               form.CompanyAddressLine2,
		"individuals":            []map[string]interface{}{},
		"companySupportingFiles": form.CompanySupportingFiles,
	}

	for _, plate := range form.CompanyPlates {
		individual := map[string]interface{}{
			"fullName":      form.ContactPerson,
			"email":         form.ContactEmail,
			"contactNumber": form.ContactNumber,
			"address1":      form.CompanyAddressLine1,
			"address2":      form.CompanyAddressLine2,
			"nric":          plate.NricNumber,
			"vehicleNum":    plate.PlateNumber,
			"tinNumber":     form.TinNumber,
			"vehicleClass":  plate.VehicleType,
		}
		natsPayload["individuals"] = append(natsPayload["individuals"].([]map[string]interface{}), individual)
	}

	data, err := json.Marshal(natsPayload)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to marshal NATS payload", err.Error())
	}

	registerEmployerSubject := os.Getenv("REGISTER_EMPLOYER_SUBJECT")
	if registerEmployerSubject == "" {
		return ErrorResponse(c, 500, "Missing REGISTER_EMPLOYER_SUBJECT environment variable", nil)
	}

	siteCode := os.Getenv("SITE_CODE")
	if siteCode == "" {
		return ErrorResponse(c, 500, "Missing SITE_CODE environment variable", nil)
	}

	subject := fmt.Sprintf("%s.%s", registerEmployerSubject, siteCode)
	natsResponse, err := natsConn.Request(subject, data, 10*time.Second)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to send NATS message", err.Error())
	}

	var natsResponseData interface{}
	if err := json.Unmarshal(natsResponse.Data, &natsResponseData); err != nil {
		natsResponseData = string(natsResponse.Data)
	}

	responseData := map[string]interface{}{
		"id":           form.CompayRegistrationNumber,
		"natsResponse": natsResponseData,
	}
	return SuccessResponse(c, "Company registration finalized successfully", responseData)
}

func handleUplaodCompanyPlateFile(c echo.Context) error {
	registerId := c.Param("id")
	plate := c.Param("plateNumber")

	reader, err := c.Request().MultipartReader()
	if err != nil {
		return ErrorResponse(c, 400, "Invalid multipart form data", err.Error())
	}

	part, err := reader.NextPart()
	if err == io.EOF {
		return ErrorResponse(c, 400, "No file parts found", nil)
	}
	if err != nil {
		return ErrorResponse(c, 500, "Failed to read multipart data", err.Error())
	}

	savePath := filepath.Join("uploads", registerId, "plates")
	os.MkdirAll(savePath, 0755)

	dstPath := filepath.Join(savePath, fmt.Sprintf("%s_%s", plate, part.FileName()))

	dst, err := os.Create(dstPath)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to create file on server", err.Error())
	}
	defer dst.Close()

	written, err := io.Copy(dst, part)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to save file on server", err.Error())
	}

	log.Printf("Saved file %s (%d bytes) to project %s", part.FileName(), written, registerId)

	responseData := map[string]interface{}{
		"status":    "success",
		"filename":  part.FileName(),
		"bytes":     written,
		"savedPath": dstPath,
		"projectId": registerId,
	}
	return SuccessResponse(c, "Plate file uploaded successfully", responseData)
}

func handleUploadCompanyGeneralFile(c echo.Context) error {
	registerId := c.Param("id")

	reader, err := c.Request().MultipartReader()
	if err != nil {
		return ErrorResponse(c, 400, "Invalid multipart form data", err.Error())
	}

	part, err := reader.NextPart()
	if err == io.EOF {
		return ErrorResponse(c, 400, "No file parts found", nil)
	}
	if err != nil {
		return ErrorResponse(c, 500, "Failed to read multipart data", err.Error())
	}

	savePath := filepath.Join("uploads", registerId, "general")
	os.MkdirAll(savePath, 0755)

	dstPath := filepath.Join(savePath, part.FileName())

	dst, err := os.Create(dstPath)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to create file on server", err.Error())
	}
	defer dst.Close()

	written, err := io.Copy(dst, part)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to save file on server", err.Error())
	}

	log.Printf("Saved file %s (%d bytes) to project %s", part.FileName(), written, registerId)

	responseData := map[string]interface{}{
		"status":    "success",
		"filename":  part.FileName(),
		"bytes":     written,
		"savedPath": dstPath,
		"projectId": registerId,
	}
	return SuccessResponse(c, "General file uploaded successfully", responseData)
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
