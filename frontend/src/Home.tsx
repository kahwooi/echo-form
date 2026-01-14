import React, { useEffect, useState } from "react";
import { Button, Card, Col, Row, Typography, Layout, Spin } from "antd";
import { useSearchParams } from "react-router-dom";
import axios from "axios";

const { Title, Text } = Typography;
const { Content } = Layout;

const apiParkingBase = process.env.BUN_PUBLIC_PARKING_API_BASE;

export function Home() {
  const [searchParams] = useSearchParams();
  const parkingLocationId = searchParams.get('id') || '';
  const [configLoading, setConfigLoading] = useState(true);
  const [enableRegistration, setEnableRegistration] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!parkingLocationId) {
        setConfigLoading(false);
        return;
      }

      try {
        const response = await axios.get(`${apiParkingBase}/api/public/parking-locations/settings`, {
          params: { id: parkingLocationId }
        });
        setEnableRegistration(response.data.enable_registration || false);
      } catch (error) {
        console.error("Failed to fetch config:", error);
        setEnableRegistration(false);
      } finally {
        setConfigLoading(false);
      }
    };
    fetchConfig();
  }, [parkingLocationId]);

  if (configLoading) {
    return (
      <Layout style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <Card style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, fontSize: '16px' }}>Loading...</div>
          </Card>
        </Content>
      </Layout>
    );
  }

  if (!enableRegistration) {
    return (
      <Layout style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '24px' }}>
          <Card style={{ textAlign: 'center', padding: '40px', maxWidth: '600px' }}>
            <Title level={2} style={{ color: '#1890ff', marginBottom: 24 }}>
              Genting Season Pass Registration
            </Title>
            <div style={{ padding: '24px', background: '#fff7e6', borderRadius: '8px', border: '1px solid #ffd591' }}>
              <Text style={{ color: '#d46b08', fontSize: '18px' }}>
                Registration is currently disabled for this location.
              </Text>
            </div>
          </Card>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Content
        style={{
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          minHeight: '100vh',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '800px',
            margin: '0 auto',
          }}
        >
          <Card
            style={{
              width: '100%',
              background: 'white',
              borderRadius: '16px',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
              padding: '32px',
            }}
          >
            <Title 
              level={2} 
              style={{ 
                textAlign: 'center', 
                marginBottom: 32,
                fontSize: '2rem',
                color: '#1890ff'
              }}
            >
              Genting Season Pass Registration
            </Title>
            
            <Row gutter={[24, 24]} style={{ marginTop: 20 }}>
              <Col xs={24} md={12}>
                <Button 
                  type="primary" 
                  style={{
                    height: 100, 
                    fontSize: '20px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    transition: 'all 0.3s ease'
                  }} 
                  block 
                  size="large" 
                  href={`/resident?id=${parkingLocationId}`}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(24, 144, 255, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(24, 144, 255, 0.3)';
                  }}
                >
                  Resident Registration
                </Button>
              </Col>
              <Col xs={24} md={12}>
                <Button 
                  type="primary" 
                  style={{
                    height: 100, 
                    fontSize: '20px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                    background: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
                    border: 'none',
                    transition: 'all 0.3s ease'
                  }} 
                  block 
                  size="large" 
                  href={`/company?id=${parkingLocationId}`}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(82, 196, 26, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(82, 196, 26, 0.3)';
                  }}
                >
                  Company Registration
                </Button>
              </Col>
            </Row>
            
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <p style={{ color: '#666', fontSize: '16px', lineHeight: 1.6 }}>
                Select the appropriate registration type to proceed with your 
                Genting Season Pass application.
              </p>
            </div>
          </Card>
        </div>
      </Content>
    </Layout>
  );
}