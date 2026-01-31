package models

type ResidentRegisterForm struct {
	ResidentName            string                  `json:"residentName" validate:"required,min=3,max=50"`
	ContactNumber           string                  `json:"contactNumber" validate:"required,min=2,max=10"`
	ContactEmail            string                  `json:"contactEmail" validate:"required,email"`
	ResidentAddressLine1    string                  `json:"residentAddressLine1" validate:"required,min=5,max=100"`
	ResidentAddressLine2    string                  `json:"residentAddressLine2,omitempty" validate:"max=100"`
	NricNumber              string                  `json:"nricNumber,omitempty"`
	TinNumber               string                  `json:"tinNumber,omitempty"`
	ResidentPlates          ResidentPlates          `json:"residentPlate"`
	ResidentSupportingFiles ResidentSupportingFiles `json:"residentSupportingFiles"`
}

type ResidentPlates struct {
	PlateNumber string `json:"plateNumber"`
	VehicleType string `json:"vehicleType"`
	VehiclePath string `json:"vehiclePath"`
}

type ResidentSupportingFiles struct {
	SPAPath          string `json:"spaPath"`
	ElectricBillPath string `json:"electricBillPath"`
}
