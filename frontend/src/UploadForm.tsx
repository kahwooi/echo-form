import { 
    FileTextOutlined, 
    InboxOutlined, 
    MinusCircleOutlined, 
    UploadOutlined, 
    PlusOutlined 
} from "@ant-design/icons";
import { Turnstile } from "@marsidev/react-turnstile";
import { 
    Card, 
    Typography, 
    Form, 
    message, 
    Input, 
    type UploadFile, 
    type UploadProps, 
    Button, 
    Progress, 
    Space, 
    Layout, 
    Upload, 
    Divider, 
    Row,
    Col
} from "antd";
import type { RcFile } from "antd/es/upload";
import Dragger from "antd/es/upload/Dragger";
import axios, { type AxiosProgressEvent } from "axios";
import { useEffect, useState } from "react";
import { TurnstileWidget } from "./TurnstileWidget";

const { Title, Text } = Typography;

// --- Types ---
type ProjectFormValues = {
    companyRegistrationNumber: string;
    companyName: string;
    contactPerson: string;
    plateNumbers?: string[];
}

interface CreateProjectResponse {
    id: string;
}

// Maps the Row Index (0, 1, 2) to a list of files
type PlateFileMap = Record<number, UploadFile[]>;

// --- Config ---
const API_BASE = "http://localhost:8080";

const siteKey = process.env.BUN_PUBLIC_TURNSTILE_SITE_KEY;

export function UploadForm() {
    const [form] = Form.useForm();
    const [config, setConfig] = useState({
        maxGeneralFiles: 2,
        maxPlateNumbers: 5,
        concurrentUploads: 2,
    });
    
    // State 1: General Files (SSM, Bills)
    const [generalFileList, setGeneralFileList] = useState<UploadFile[]>([]);
    
    // State 2: Plate Files (Mapped by Row Index)
    const [plateFilesMap, setPlateFilesMap] = useState<PlateFileMap>({});
    
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

    // --- Config ---
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await axios.get(`${API_BASE}/config`);
                setConfig(response.data);
            } catch (error) {
                console.error("Failed to fetch config:", error);
            }
        }

        fetchConfig();
    }, []);

    // --- Handlers ---
    // Handler for General Files (Bottom Dragger)
    const handleGeneralFileChange: UploadProps['onChange'] = ({ fileList }) => {
        setGeneralFileList(fileList);
    }

    // Handler for Specific Plate Files (Row based)
    const handlePlateFileChange = (index: number) => ({ fileList }: { fileList: UploadFile[] }) => {
        setPlateFilesMap(prev => ({
            ...prev,
            [index]: fileList
        }));
    }

    const dummyRequest: UploadProps['customRequest'] = ({ onSuccess }) => {
        setTimeout(() => { if (onSuccess) onSuccess("ok"); }, 0);
    }

    // --- API Calls ---

    const putFileToOSS = async (signedUrl: string, file: RcFile, onProgress?: (event: AxiosProgressEvent) => void) => {
        await axios.put(signedUrl, file, {
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
            },
            onUploadProgress: onProgress,
        });
    }

    // 1. Upload General File
    const uploadGeneralFile = async (file: RcFile, companyId: string): Promise<void> => {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const { data } = await axios.get(`${API_BASE}/presigned`, {
                params: {
                    registerId: companyId,
                    fileType: 'general',
                    fileName: file.name,
                    contentType: file.type || 'application/octet-stream'
                }
            });
            await putFileToOSS(data.url, file, (event) => updateProgress(event, file.uid));
            updateFileStatus(setGeneralFileList, file.uid, 'done');
        } catch (err) {
            console.error(err);
            updateFileStatus(setGeneralFileList, file.uid, 'error');
            throw err; // Re-throw to be caught by queue
        }
    }

    // 2. Upload Plate Specific File
    const uploadPlateFile = async (file: RcFile, companyId: string, plateNumber: string, rowIndex: number): Promise<void> => {
         // Sanitize plate number for URL (remove spaces, etc if needed)
        const safePlate = encodeURIComponent(plateNumber);

        try {
            const { data } = await axios.get(`${API_BASE}/presigned`, {
                params: {
                    registerId: companyId,
                    fileType: 'plate',
                    fileName: file.name,
                    plateNumber: safePlate,
                    contentType: file.type || 'application/octet-stream'
                }
            });

            await putFileToOSS(data.url, file, (event) => updateProgress(event, file.uid));
            
            // Helper to update state inside the Map
            setPlateFilesMap(prev => {
                const currentList = prev[rowIndex] || [];
                return {
                    ...prev,
                    [rowIndex]: currentList.map(f => f.uid === file.uid ? { ...f, status: 'done' } : f)
                };
            });
        } catch (err) {
            console.error(err);
             // Update error state in Map
             setPlateFilesMap(prev => {
                const currentList = prev[rowIndex] || [];
                return {
                    ...prev,
                    [rowIndex]: currentList.map(f => f.uid === file.uid ? { ...f, status: 'error' } : f)
                };
            });
            throw err;
        }
    }

    // --- Helpers ---

    const updateProgress = (event: AxiosProgressEvent, uid: string) => {
        if (event.total) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress((prev) => ({ ...prev, [uid]: percent }));
        }
    };

    const updateFileStatus = (setter: React.Dispatch<React.SetStateAction<UploadFile[]>>, uid: string, status: 'done' | 'error') => {
        setter((prev) => prev.map((f) => (f.uid === uid ? { ...f, status } : f)));
    };

    // --- Queue Logic ---

    const processUploadQueue = async (companyId: string, values: ProjectFormValues) => {
        const tasks: (() => Promise<void>)[] = [];

        // 1. Prepare General File Tasks
        generalFileList.forEach(file => {
            if (file.originFileObj && file.status !== 'done') {
                tasks.push(() => uploadGeneralFile(file.originFileObj as RcFile, companyId));
            }
        });

        // 2. Prepare Plate File Tasks
        // We look at the submitted form values to match Index -> Plate String
        const plateNumbers = values.plateNumbers || [];
        
        plateNumbers.forEach((plateStr, index) => {
            const filesForRow = plateFilesMap[index] || [];
            filesForRow.forEach(file => {
                if (file.originFileObj && file.status !== 'done') {
                    tasks.push(() => uploadPlateFile(file.originFileObj as RcFile, companyId, plateStr, index));
                }
            });
        });

        // 3. Execute with Concurrency Limit
        const activeWorkers: Promise<void>[] = [];
        const queue = [...tasks];

        const startWorker = async () => {
            while (queue.length > 0) {
                const task = queue.shift();
                if (task) await task();
            }
        };

        for (let i = 0; i < config.concurrentUploads; i++) {
            activeWorkers.push(startWorker());
        }

        await Promise.all(activeWorkers);
    }

    const onFinish = async (values: ProjectFormValues) => {
        if (!turnstileToken) {
            return message.error('Please complete the security verification.');
        }

        // Basic Validation: Ensure at least one file exists somewhere
        const hasGeneral = generalFileList.length > 0;
        const hasPlateFiles = Object.values(plateFilesMap).some(list => list.length > 0);

        if (!hasGeneral && !hasPlateFiles) {
            return message.error('Please attach at least one file (General or Plate).');
        }

        setUploading(true);
        setUploadProgress({});

        try {
            // Step 1: Create Project
            const response = await axios.post<CreateProjectResponse>(`${API_BASE}/registers/company`, {
                companyName: values.companyName,
                companyRegistrationNumber: values.companyRegistrationNumber,
                plateNumbers: values.plateNumbers?.filter(p => p && p.trim() !== '') || [],
            });

            const companyId = response.data.id;
            message.success(`Project ${companyId} created. Starting uploads...`);

            // Step 2: Upload Files
            await processUploadQueue(companyId, values);

            message.success('All files uploaded successfully!');
            
            // Cleanup
            form.resetFields();
            setGeneralFileList([]);
            setPlateFilesMap({});
            setUploadProgress({});

        } catch (error) {
            console.error(error);
            message.error('Submission failed.');
        } finally {
            setUploading(false);
        }
    }

    return (
        <Layout style={{ padding: '2rem', minHeight: '100vh', background: '#f0f2f5' }}>
            <Card style={{ width: '100%' }}>
                <Title level={2} style={{ textAlign: 'center', marginBottom: 30 }}>Company Registration</Title>
                
                <Form 
                    form={form} 
                    onFinish={onFinish} 
                    disabled={uploading} 
                    layout="vertical" 
                    initialValues={{ plateNumbers: ['']}}
                >
                    {/* --- Project Details --- */}
                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="companyRegistrationNumber"
                                label="Company Registration Number"
                                rules={[{ required: true, message: 'Please enter company registration number' }]}
                            >
                                <Input placeholder="Enter Company Registration Number" size="large" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="companyName"
                                label="Company Name"
                                rules={[{ required: true, message: 'Please enter company name' }]}
                            >
                                <Input placeholder="Enter Company Name" size="large" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="contactPerson"
                                label="Contact Person"
                                rules={[{ required: true, message: 'Please enter contact person' }]}
                            >
                                <Input placeholder="Enter Contact Person" size="large" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider>Vehicle Plates & Documents</Divider>

                    {/* --- Dynamic Plate List --- */}
                    <Form.List name="plateNumbers">
                        {(fields, { add, remove }) => (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {fields.map(({ key, name, ...restField }, index) => (
                                    <Card 
                                        key={key} 
                                        size="small" 
                                        type="inner"
                                        title={`Vehicle #${index + 1}`}
                                        extra={fields.length > 1 ? (
                                            <Button 
                                                type="text" 
                                                danger 
                                                icon={<MinusCircleOutlined />} 
                                                onClick={() => {
                                                    remove(name);
                                                    // Cleanup files for this index
                                                    setPlateFilesMap(prev => {
                                                        const copy = {...prev};
                                                        delete copy[index];
                                                        return copy;
                                                    });
                                                }} 
                                            />
                                        ) : null}
                                    >
                                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                                            {/* Plate Input */}
                                            <Form.Item
                                                {...restField}
                                                name={name}
                                                rules={[{ required: true, message: 'Required' }]}
                                                style={{ flex: 1, marginBottom: 0 }}
                                            >
                                                <Input placeholder="Enter Plate Number (e.g. WWA 1234)" />
                                            </Form.Item>

                                            {/* Small Upload Button per row */}
                                            <Upload
                                                fileList={plateFilesMap[index] || []}
                                                onChange={handlePlateFileChange(index)}
                                                beforeUpload={() => false}
                                                customRequest={dummyRequest}
                                                maxCount={1} // Assuming 1 doc per plate, change if needed
                                            >
                                                <Button icon={<UploadOutlined />}>Attach Doc</Button>
                                            </Upload>
                                        </div>

                                        {/* Progress Bar for this specific row's file */}
                                        {uploading && (plateFilesMap[index] || []).map(f => (
                                            uploadProgress[f.uid] !== undefined && (
                                                <Progress 
                                                    key={f.uid} 
                                                    percent={uploadProgress[f.uid]} 
                                                    size="small" 
                                                    style={{ marginTop: 8 }} 
                                                />
                                            )
                                        ))}
                                    </Card>
                                ))}
                                
                                <Button 
                                    type="dashed" 
                                    onClick={() => add()} 
                                    block 
                                    icon={<PlusOutlined />}
                                    disabled={fields.length >= config.maxPlateNumbers}
                                >
                                    Add Another Vehicle
                                </Button>
                            </div>
                        )}
                    </Form.List>

                    <Divider>General Documents</Divider>

                    {/* --- General Files Dragger --- */}
                    <Form.Item
                        label="Supporting Documents (SSM, Bills, etc)"
                        extra="Max 5 files. PDF, JPG, PNG."
                    >
                        <Dragger
                            name="generalFiles"
                            multiple
                            maxCount={config.maxGeneralFiles}
                            fileList={generalFileList}
                            onChange={handleGeneralFileChange}
                            beforeUpload={() => false}
                            customRequest={dummyRequest}
                            listType="picture"
                        >
                            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                            <p className="ant-upload-text">Click or drag files to this area</p>
                        </Dragger>
                    </Form.Item>

                    {/* Progress Bars for General Files */}
                    {uploading && generalFileList.map(f => (
                        uploadProgress[f.uid] !== undefined && uploadProgress[f.uid]! < 100 && (
                            <div key={f.uid} style={{ marginBottom: 4 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>{f.name}</Text>
                                <Progress percent={uploadProgress[f.uid]} size="small" />
                            </div>
                        )
                    ))}

                    <Form.Item>
                        <TurnstileWidget
                            siteKey={siteKey || ''}
                            onVerify={setTurnstileToken}
                            onError={() => {
                                setTurnstileToken(null);
                                message.error('Security verification failed. Please try again.');
                            }}
                        />
                    </Form.Item>

                    <Form.Item style={{ marginTop: 24 }}>
                        <Button 
                            type="primary" 
                            htmlType="submit" 
                            size="large" 
                            block 
                            loading={uploading}
                        >
                            {uploading ? 'Uploading...' : 'Submit Project'}
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </Layout>
    );
}