import React from "react";
import { Button, Card, Col, Row, Typography } from "antd";

const { Title } = Typography;

export function Home() {
  return (
    <Card>
        <Title level={2}>Genting Season Pass Registration</Title>
        <Row gutter={16} style={{ marginTop: 20 }}>
          <Col span={12}>
            <Button style={{height: 100, fontSize: 20}} block size="large" href="/resident">Resident</Button>
          </Col>
          <Col span={12}>
            <Button style={{height: 100, fontSize: 20}} block size="large" href="/company">Company</Button>
          </Col>
        </Row>
    </Card>
  );
}