package main

import (
	"net/http"

	"github.com/go-playground/validator"
	"github.com/labstack/echo/v4"
)

type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

type ValidatorErrorResponse struct {
	Message string            `json:"message"`
	Errors  []ValidationError `json:"errors"`
}

type CustomValidator struct {
	validator *validator.Validate
}

func (cv *CustomValidator) Validate(i interface{}) error {
	if err := cv.validator.Struct(i); err != nil {
		var errors []ValidationError

		for _, err := range err.(validator.ValidationErrors) {
			errors = append(errors, ValidationError{
				Field:   err.Field(),
				Message: getErrorMessages(err),
			})
		}

		return echo.NewHTTPError(http.StatusBadRequest, ValidatorErrorResponse{
			Message: "validate failed",
			Errors:  errors,
		})
	}
	return nil
}

func getErrorMessages(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "This field is required"
	case "email":
		return "Invalid email format"
	case "min":
		return "Too short"
	case "max":
		return "Too long"
	case "gte":
		return "Value too small"
	case "lte":
		return "Value too large"
	default:
		return "Invalid value"
	}
}

func NewValidator() *CustomValidator {
	return &CustomValidator{validator: validator.New()}
}
