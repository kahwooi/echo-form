package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"maxpark_opp_registration/config"
	"maxpark_opp_registration/models"
	"maxpark_opp_registration/services"
	"maxpark_opp_registration/utils"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

type CompanyHandler struct {
	natsService *services.NATSService
	config      *config.Config
}

func NewCompanyHandler(natsService *services.NATSService, cfg *config.Config) *CompanyHandler {
	return &CompanyHandler{natsService: natsService, config: cfg}
}

func (h *CompanyHandler) HandleCreateCompanyRegister(c echo.Context) error {
	form := new(models.CompanyRegisterForm)

	if err := c.Bind(form); err != nil {
		return utils.ErrorResponse(c, 400, "Invalid input format", err.Error())
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return utils.ErrorResponse(c, http.StatusBadRequest, "Validation failed", he.Message)
		}
		return utils.ErrorResponse(c, http.StatusBadRequest, "Validation failed", err.Error())
	}

	subject := fmt.Sprintf("%s.%s", h.config.RegisterEmployerIDSubject, h.config.SiteCode)
	natsResponse, err := h.natsService.GetConnection().Request(subject, nil, 10*time.Second)
	if err != nil {
		return utils.ErrorResponse(c, 500, "Failed to send NATS message", err.Error())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(natsResponse.Data, &response); err != nil {
		return utils.ErrorResponse(c, 500, "Failed to parse NATS response", err.Error())
	}

	employerID, ok := response["data"].(string)
	if !ok {
		return utils.ErrorResponse(c, 500, "Invalid response format", "Missing or invalid ID")
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
	return utils.SuccessResponse(c, "Company registration initiated successfully", responseData)
}

func (h *CompanyHandler) HandleCreateCompanyRegisterFinalize(c echo.Context) error {
	form := new(models.CompanyRegisterForm)

	if err := c.Bind(form); err != nil {
		return utils.ErrorResponse(c, 400, "Invalid input format", err.Error())
	}

	if err := c.Validate(form); err != nil {
		if he, ok := err.(*echo.HTTPError); ok {
			return utils.ErrorResponse(c, http.StatusBadRequest, "Validation failed", he.Message)
		}
		return utils.ErrorResponse(c, http.StatusBadRequest, "Validation failed", err.Error())
	}

	natsPayload := map[string]interface{}{
		"employerID":             form.EmployerID,
		"companyRegNum":          form.CompanyRegistrationNumber,
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
			"fullName":         form.ContactPerson,
			"email":            form.ContactEmail,
			"contactNumber":    form.ContactNumber,
			"address1":         form.CompanyAddressLine1,
			"address2":         form.CompanyAddressLine2,
			"nric":             plate.NricNumber,
			"vehicleNum":       plate.PlateNumber,
			"tinNumber":        form.TinNumber,
			"vehicleClass":     plate.VehicleType,
			"spaPath":          plate.SPAPath,
			"electricBillPath": plate.ElectricBillPath,
			"vehiclePath":      plate.VehiclePath,
		}
		natsPayload["individuals"] = append(natsPayload["individuals"].([]map[string]interface{}), individual)
	}

	data, err := json.Marshal(natsPayload)
	if err != nil {
		return utils.ErrorResponse(c, 500, "Failed to marshal NATS payload", err.Error())
	}

	subject := fmt.Sprintf("%s.%s", h.config.RegisterEmployerSubject, h.config.SiteCode)
	natsResponse, err := h.natsService.GetConnection().Request(subject, data, 10*time.Second)
	if err != nil {
		return utils.ErrorResponse(c, 500, "Failed to send NATS message", err.Error())
	}

	var natsResponseData interface{}
	if err := json.Unmarshal(natsResponse.Data, &natsResponseData); err != nil {
		natsResponseData = string(natsResponse.Data)
	}

	responseData := map[string]interface{}{
		"id":           form.CompanyRegistrationNumber,
		"natsResponse": natsResponseData,
	}
	return utils.SuccessResponse(c, "Company registration finalized successfully", responseData)
}
