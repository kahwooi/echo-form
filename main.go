package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type CompannyRegisterForm struct {
	CompayRegistrationNumber string   `json:"companyRegistrationNumber"`
	CompanyName              string   `json:"companyName"`
	ContactPerson            string   `json:"contactPerson"`
	PlateNumbers             []string `json:"plateNumbers"`
}

func main() {
	e := echo.New()

	e.Use(middleware.CORS())

	e.GET("/config", handleConfig)

	e.POST("/registers/company", handleCreateCompanyRegister)

	e.POST("/registers/company/:id/plates/:plateNumber", handleUplaodCompanyPlateFile)

	e.POST("/registers/company/:id/general", handleUploadCompanyGeneralFile)

	e.Logger.Fatal(e.Start(":8080"))
}

func handleConfig(c echo.Context) error {
	return c.JSON(200, map[string]string{
		"maxGeneralFiles":   "2",
		"maxPlateNumbers":   "5",
		"concurrentUploads": "2",
	})
}

func handleCreateCompanyRegister(c echo.Context) error {
	form := new(CompannyRegisterForm)

	if err := c.Bind(form); err != nil {
		return c.String(400, "Invalid input")
	}

	registerId := uuid.New().String()

	savePath := filepath.Join("uploads", registerId)
	if err := os.MkdirAll(savePath, 0755); err != nil {
		return c.String(500, "Failed to create register directory")
	}

	log.Printf("Created company name %s path %s", form.CompanyName, registerId)

	for _, plate := range form.PlateNumbers {
		log.Printf(" - with plate number: %s", plate)
	}

	return c.JSON(200, map[string]string{"id": registerId})
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
