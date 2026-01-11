package handlers

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"maxpark_opp_registration/utils"

	"github.com/labstack/echo/v4"
)

func HandleUploadCompanyPlateFile(c echo.Context) error {
	registerId := c.Param("id")
	plate := c.Param("plateNumber")

	reader, err := c.Request().MultipartReader()
	if err != nil {
		return utils.ErrorResponse(c, 400, "Invalid multipart form data", err.Error())
	}

	part, err := reader.NextPart()
	if err == io.EOF {
		return utils.ErrorResponse(c, 400, "No file parts found", nil)
	}
	if err != nil {
		return utils.ErrorResponse(c, 500, "Failed to read multipart data", err.Error())
	}

	savePath := filepath.Join("uploads", registerId, "plates")
	os.MkdirAll(savePath, 0755)

	dstPath := filepath.Join(savePath, fmt.Sprintf("%s_%s", plate, part.FileName()))

	dst, err := os.Create(dstPath)
	if err != nil {
		return utils.ErrorResponse(c, 500, "Failed to create file on server", err.Error())
	}
	defer dst.Close()

	written, err := io.Copy(dst, part)
	if err != nil {
		return utils.ErrorResponse(c, 500, "Failed to save file on server", err.Error())
	}

	log.Printf("Saved file %s (%d bytes) to project %s", part.FileName(), written, registerId)

	responseData := map[string]interface{}{
		"status":    "success",
		"filename":  part.FileName(),
		"bytes":     written,
		"savedPath": dstPath,
		"projectId": registerId,
	}
	return utils.SuccessResponse(c, "Plate file uploaded successfully", responseData)
}

func HandleUploadCompanyGeneralFile(c echo.Context) error {
	registerId := c.Param("id")

	reader, err := c.Request().MultipartReader()
	if err != nil {
		return utils.ErrorResponse(c, 400, "Invalid multipart form data", err.Error())
	}

	part, err := reader.NextPart()
	if err == io.EOF {
		return utils.ErrorResponse(c, 400, "No file parts found", nil)
	}
	if err != nil {
		return utils.ErrorResponse(c, 500, "Failed to read multipart data", err.Error())
	}

	savePath := filepath.Join("uploads", registerId, "general")
	os.MkdirAll(savePath, 0755)

	dstPath := filepath.Join(savePath, part.FileName())

	dst, err := os.Create(dstPath)
	if err != nil {
		return utils.ErrorResponse(c, 500, "Failed to create file on server", err.Error())
	}
	defer dst.Close()

	written, err := io.Copy(dst, part)
	if err != nil {
		return utils.ErrorResponse(c, 500, "Failed to save file on server", err.Error())
	}

	log.Printf("Saved file %s (%d bytes) to project %s", part.FileName(), written, registerId)

	responseData := map[string]interface{}{
		"status":    "success",
		"filename":  part.FileName(),
		"bytes":     written,
		"savedPath": dstPath,
		"projectId": registerId,
	}
	return utils.SuccessResponse(c, "General file uploaded successfully", responseData)
}
