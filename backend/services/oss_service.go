package services

import (
	"fmt"
	"path"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
)

type OSSService struct {
	client     *oss.Client
	bucketName string
}

func NewOSSService(endpoint, accessKeyID, accessKeySecret, bucketName string) (*OSSService, error) {
	client, err := oss.New(endpoint, accessKeyID, accessKeySecret)
	if err != nil {
		return nil, err
	}
	return &OSSService{client: client, bucketName: bucketName}, nil
}

func (o *OSSService) GeneratePresignedURL(registerId, fileType, fileName, employerId, plateNumber, contentType string) (string, string, error) {
	bucket, err := o.client.Bucket(o.bucketName)
	if err != nil {
		return "", "", err
	}

	var objectKey string
	switch fileType {
	case "plate":
		objectKey = path.Join("uploads", registerId, "plates", fmt.Sprintf("%s_%s", plateNumber, fileName))
	case "general":
		if employerId == "" {
			objectKey = path.Join("uploads", registerId, "general", fileName)
		} else {
			objectKey = path.Join("uploads", registerId, "general", fmt.Sprintf("%s_%s", employerId, fileName))
		}
	default:
		return "", "", fmt.Errorf("invalid fileType: %s", fileType)
	}

	signedURL, err := bucket.SignURL(objectKey, oss.HTTPPut, 900, oss.ContentType(contentType))
	if err != nil {
		return "", "", err
	}

	return signedURL, objectKey, nil
}

func (o *OSSService) GenerateDownloadURL(objectKey string) (string, error) {
	bucket, err := o.client.Bucket(o.bucketName)
	if err != nil {
		return "", err
	}

	return bucket.SignURL(objectKey, oss.HTTPGet, 900)
}
