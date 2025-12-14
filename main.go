package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type ResidentRegisterForm struct {
	ResidentName  string `json:"residentName" validate:"required,min=3,max=50"`
	ContactNumber string `json:"contactNumber" validate:"required,min=2,max=10"`
	AddressLine1  string `json:"addressLine1" validate:"required,min=5,max=100"`
	AddressLine2  string `json:"addressLine2" validate:"max=100"`
	PlateNumber   string `json:"plateNumber" validate:"required,min=2,max=10"`
	VehicleType   string `json:"vehicleType" validate:"required,oneof=1 2 3 4 5 6 7"`
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

	e := echo.New()

	e.Validator = NewValidator()

	e.Use(middleware.CORS())

	e.GET("/config", handleConfig)

	e.GET("/presigned", handleGetPresignedURL)

	e.GET("/presigned/download", handleGetPresignedDownloadURL)

	e.POST("/registers/resident", handleCreateResidentRegister)

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

	return SuccessResponse(c, "Registration successful", map[string]string{"id": registerId})
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
		return c.String(400, "Invalid input")
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return ErrorResponse(c, http.StatusBadRequest, "", he.Message)
		}
	}

	log.Printf("Bound form: %+v", form)

	for ind1, plates := range form.CompanyPlates {
		log.Printf("%d - with plate number: %s = %s = %s \n", ind1, plates.PlateNumber, plates.VehicleType, plates.FileKey)
	}

	for ind2, generals := range form.CompanySupportingFiles {
		log.Printf("%d - with general file key: %s \n", ind2, generals.FileKey)
	}

	return SuccessResponse(c, "Registration successful", map[string]string{"id": form.CompayRegistrationNumber})
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
