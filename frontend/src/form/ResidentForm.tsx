import { Button, Card, Col, Form, Input, Layout, Row, Typography } from "antd";
import { useState } from "react";

const { Title } = Typography;

type ResidentFormValues = {
  residentName: string;
  phoneNumber: string;
  email: string;
}

export function ResidentForm() {
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);

  const onFinish = async (values: ResidentFormValues) => {
    console.log("Form values:", values);
  }

  return (
    <Layout  style={{padding: '2rem', minHeight: '100vh', background: '#f0f2f5'}}>
      <Card style={{ width: '100%' }}>
        <Title level={2} style={{textAlign: 'center', marginBottom: 30}} >Resident Form</Title>
      
        <Form 
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{}}
        >
          <Form.Item label="Resident Name" name="residentName" rules={[{ required: true, message: 'Please enter your full name' }]}>
            <Input placeholder="Enter your full name" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Phone Number" name="phoneNumber" rules={[{required: true, message: 'Please enter your phone number'}]}>
                <Input placeholder="Enter your full name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Email" name="email" rules={[{required: true, message: 'Please enter your email'}]}>
                <Input placeholder="Enter your email" />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item style={{ marginTop: 24 }}>
            <Button 
              type="primary" 
              htmlType ="submit"
              size="large"
              block
              loading={uploading}
            >
              {uploading ? 'Submitting...' : 'Submit'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Layout>
  );
}