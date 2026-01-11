package handlers

import (
	"maxpark_opp_registration/utils"

	"github.com/labstack/echo/v4"
)

func HandleConfig(c echo.Context) error {
	configData := map[string]string{
		"maxGeneralFiles":   "2",
		"maxPlateNumbers":   "5",
		"concurrentUploads": "2",
	}
	return utils.SuccessResponse(c, "Configuration retrieved successfully", configData)
}
