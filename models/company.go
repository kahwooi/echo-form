package models

type CompanyRegisterForm struct {
	EmployerID                string                 `json:"employerID"`
	CompanyRegistrationNumber string                 `json:"companyRegistrationNumber"`
	TinNumber                 string                 `json:"tinNumber"`
	CompanyName               string                 `json:"companyName"`
	ContactPerson             string                 `json:"contactPerson"`
	ContactNumber             string                 `json:"contactNumber"`
	ContactEmail              string                 `json:"contactEmail" validate:"required,email"`
	CompanyAddressLine1       string                 `json:"companyAddressLine1" validate:"required,min=5,max=100"`
	CompanyAddressLine2       string                 `json:"companyAddressLine2" validate:"max=100"`
	CompanyPlates             []CompanyPlates        `json:"companyPlates"`
	CompanySupportingFiles    CompanySupportingFiles `json:"companySupportingFiles"`
}

type CompanyPlates struct {
	NricNumber       string `json:"nricNumber"`
	PlateNumber      string `json:"plateNumber"`
	VehicleType      string `json:"vehicleType"`
	SPAPath          string `json:"spaPath"`
	ElectricBillPath string `json:"electricBillPath"`
	VehiclePath      string `json:"vehiclePath"`
}

type CompanySupportingFiles struct {
	SSMPath          string `json:"ssmPath"`
	ElectricBillPath string `json:"electricBillPath"`
	VehiclePath      string `json:"vehiclePath"`
}
