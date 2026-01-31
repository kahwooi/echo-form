package services

import (
	"log"

	"github.com/nats-io/nats.go"
)

type NATSService struct {
	conn *nats.Conn
}

func NewNATSService(url string) (*NATSService, error) {
	conn, err := nats.Connect(url)
	if err != nil {
		return nil, err
	}
	log.Printf("Connected to NATS at %s", url)
	return &NATSService{conn: conn}, nil
}

func (n *NATSService) GetConnection() *nats.Conn {
	return n.conn
}

func (n *NATSService) Close() {
	if n.conn != nil {
		n.conn.Close()
	}
}
