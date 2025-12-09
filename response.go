package main

import "github.com/labstack/echo/v4"

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Errors  interface{} `json:"errors,omitempty"`
}

func SuccessResponse(c echo.Context, message string, data interface{}) error {
	return c.JSON(200, APIResponse{
		Success: true,
		Message: message,
		Data:    data,
	})
}

func ErrorResponse(c echo.Context, code int, message string, errors interface{}) error {
	return c.JSON(code, APIResponse{
		Success: false,
		Message: message,
		Errors:  errors,
	})
}
