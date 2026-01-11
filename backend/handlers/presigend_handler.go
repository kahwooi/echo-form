package handlers

import (
	"net/http"

	"maxpark_opp_registration/services"
	"maxpark_opp_registration/utils"

	"github.com/labstack/echo/v4"
)

type PresignedHandler struct {
	ossService *services.OSSService
}

func NewPresignedHandler(ossService *services.OSSService) *PresignedHandler {
	return &PresignedHandler{ossService: ossService}
}

func (h *PresignedHandler) HandleGetPresignedURL(c echo.Context) error {
	registerId := c.QueryParam("registerId")
	fileType := c.QueryParam("fileType")
	fileName := c.QueryParam("fileName")
	employerId := c.QueryParam("employerId")
	plateNumber := c.QueryParam("plateNumber")
	contentType := c.QueryParam("contentType")

	if contentType == "" {
		contentType = "application/octet-stream"
	}

	signedURL, objectKey, err := h.ossService.GeneratePresignedURL(
		registerId,
		fileType,
		fileName,
		employerId,
		plateNumber,
		contentType,
	)
	if err != nil {
		return utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate signed URL", err.Error())
	}

	responseData := map[string]string{
		"url": signedURL,
		"key": objectKey,
	}
	return utils.SuccessResponse(c, "Presigned URL generated successfully", responseData)
}

func (h *PresignedHandler) HandleGetPresignedDownloadURL(c echo.Context) error {
	objectKey := c.QueryParam("key")

	signedUrl, err := h.ossService.GenerateDownloadURL(objectKey)
	if err != nil {
		return utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate signed URL", err.Error())
	}

	responseData := map[string]string{
		"downloadUrl": signedUrl,
		"key":         objectKey,
	}
	return utils.SuccessResponse(c, "Download URL generated successfully", responseData)
}
