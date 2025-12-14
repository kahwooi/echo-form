import {
    InboxOutlined,
    ArrowLeftOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    UploadOutlined
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
    Layout,
    Divider,
    Row,
    Col,
    Alert,
    Tag,
    Space,
    Select,
    Checkbox,
    Upload
} from "antd";
import type { RcFile } from "antd/es/upload";
import Dragger from "antd/es/upload/Dragger";
import axios, { type AxiosProgressEvent } from "axios";
import { useEffect, useState } from "react";

const { Title, Text } = Typography;

// --- Types ---
type CustomUploadFile = UploadFile & {
    response?: {
        ossKey: string;
    };
    fileType: 'spa' | 'bill'; // Resident-specific document types
};

type ResidentFormValues = {
    residentName: string;
    contactNumber: string;
    contactEmail: string;
    residentAddressLine1: string;
    residentAddressLine2?: string;
    plateNumber: string;
    vehicleType: string;
    consentPDPA: boolean;
    consentTOC: boolean;
}

interface CreateResidentRequest {
    residentName: string;
    contactNumber: string;
    contactEmail: string;
    residentAddressLine1: string;
    residentAddressLine2?: string;
    plateNumber: string;
    vehicleType: string;
}

interface CreateResidentResponse {
    id: string;
}

interface PlateFileEntry {
    plateNumber: string;
    vehicleType: string;
    fileKey: string;
}

interface SupportingFileEntry {
    fileKey: string;
    type: 'spa' | 'bill';
}

interface FinalizeResidentRequest {
    residentName: string;
    contactNumber: string;
    contactEmail: string;
    residentAddressLine1: string;
    residentAddressLine2?: string;
    plateNumber: string;
    vehicleType: string;
    residentPlate: PlateFileEntry;
    residentSupportingFiles: SupportingFileEntry[];
}

interface FinalizeResidentResponse {
    id: string;
}

interface UploadResult {
    type: 'supporting' | 'vehicle';
    uid: string;
    originalName: string;
    ossKey?: string;
    error?: Error;
    fileType?: 'spa' | 'bill';
}

// Fixed document types for resident
const fixedDocumentTypes: { key: 'spa' | 'bill', label: string, required: boolean }[] = [
    { key: 'spa', label: 'SPA or Tenancy Agreement', required: true },
    { key: 'bill', label: 'Electricity Bill', required: true },
];

const vehicleOptions = [
    { value: '1', label: 'Class 1' },
    { value: '2', label: 'Class 2' },
    { value: '3', label: 'Class 3' },
    { value: '4', label: 'Class 4' },
    { value: '5', label: 'Class 5' },
    { value: '6', label: 'Class 6' },
    { value: '7', label: 'Class 7' }
];

// --- Config ---
const apiBase = process.env.BUN_PUBLIC_API_BASE || "http://localhost:8080";
const siteKey = process.env.BUN_PUBLIC_TURNSTILE_SITE_KEY || '';

export function ResidentForm() {
    const [form] = Form.useForm();
    const [config, setConfig] = useState({
        maxGeneralFiles: 2, // Max 2 supporting documents (SPA + Bill)
        concurrentUploads: 2,
        maxFileSizeMB: 100,
        allowedTypes: ['image/', 'application/pdf', 'text/plain']
    });

    // State for files - simplified for resident
    const [supportingFileList, setSupportingFileList] = useState<CustomUploadFile[]>([]);
    const [vehicleFileList, setVehicleFileList] = useState<CustomUploadFile[]>([]);
    
    // Upload state
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

    // Fetch config
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await axios.get(`${apiBase}/config`);
                setConfig(response.data);
            } catch (error) {
                console.error("Failed to fetch config:", error);
            }
        };
        fetchConfig();
    }, []);

    // --- File Handlers ---
    const handleSupportingFileChange: UploadProps['onChange'] = ({ fileList }) => {
        // Add fileType to each file
        const updatedList = fileList.map(file => ({
            ...file,
            // Determine file type based on some logic, or let user specify
            // For simplicity, we'll assume all supporting files are 'general' type
            fileType: 'spa' as 'spa' // You might want to improve this logic
        })) as CustomUploadFile[];
        
        setSupportingFileList(updatedList);
    };

    const handleVehicleFileChange: UploadProps['onChange'] = ({ fileList }) => {
        setVehicleFileList(fileList as CustomUploadFile[]);
    };

    const dummyRequest: UploadProps['customRequest'] = ({ onSuccess }) => {
        setTimeout(() => { if (onSuccess) onSuccess("ok"); }, 0);
    };

    // --- Upload Functions ---
    const putFileToOSS = async (signedUrl: string, file: RcFile, onProgress?: (event: AxiosProgressEvent) => void) => {
        await axios.put(signedUrl, file, {
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
            },
            onUploadProgress: onProgress,
        });
    };

    const updateProgress = (event: AxiosProgressEvent, uid: string) => {
        if (event.total) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(prev => ({ ...prev, [uid]: percent }));
        }
    };

    // Validate file before upload (same as company form)
    const validateFile = (file: RcFile): string | null => {
        try {
            // Check if config is loaded
            if (!config) {
                return 'Configuration not loaded. Please wait...';
            }

            // Check file size
            const maxSize = (config.maxFileSizeMB || 100) * 1024 * 1024;
            if (file.size > maxSize) {
                return `File size exceeds ${config.maxFileSizeMB || 100}MB limit`;
            }

            // Check if file has a type
            if (!file.type) {
                const fileName = file.name.toLowerCase();
                const extension = fileName.split('.').pop();
                
                const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.txt'];
                if (extension && !allowedExtensions.some(ext => fileName.endsWith(ext))) {
                    return 'File type not recognized. Allowed: PDF, JPG, PNG, DOC, TXT';
                }
                return null;
            }

            // Check file type against allowed types
            const allowedTypes = config.allowedTypes || ['image/', 'application/pdf', 'text/plain'];
            const isAllowed = allowedTypes.some(allowedType => 
                file.type?.startsWith(allowedType)
            );
            
            if (!isAllowed) {
                const fileName = file.name.toLowerCase();
                const isExtensionAllowed = 
                    fileName.endsWith('.pdf') || 
                    fileName.endsWith('.jpg') || 
                    fileName.endsWith('.jpeg') || 
                    fileName.endsWith('.png') || 
                    fileName.endsWith('.doc') || 
                    fileName.endsWith('.docx') || 
                    fileName.endsWith('.txt');
                
                if (!isExtensionAllowed) {
                    return `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`;
                }
            }

            return null;
        } catch (error) {
            console.error('Error validating file:', error);
            return 'Error validating file. Please try again.';
        }
    };

    // Process all uploads with concurrency control
    const processUploadQueue = async (residentId: string, values: ResidentFormValues): Promise<UploadResult[]> => {
        const uploadTasks: Promise<UploadResult>[] = [];

        // Prepare supporting file upload tasks
        supportingFileList.forEach((file, index) => {
            if (file.originFileObj && file.status !== 'done') {
                const task = async (): Promise<UploadResult> => {
                    const fileUid = file.uid;
                    const originalName = file.name;
                    // Assign document type based on position or let backend handle it
                    const fileType = index === 0 ? 'spa' : 'bill';

                    try {
                        // Validate file
                        const validationError = validateFile(file.originFileObj as RcFile);
                        if (validationError) {
                            throw new Error(validationError);
                        }

                        // Get presigned URL for supporting document
                        const { data } = await axios.get(`${apiBase}/presigned`, {
                            params: {
                                registerId: residentId,
                                fileType: 'general',
                                documentType: fileType, // Specify SPA or Bill
                                fileName: file.name,
                                contentType: file.type || 'application/octet-stream'
                            }
                        });

                        // Upload to OSS
                        await putFileToOSS(data.url, file.originFileObj as RcFile, 
                            (event) => updateProgress(event, fileUid));

                        // Update UI state
                        setSupportingFileList(prev => 
                            prev.map(f => f.uid === fileUid 
                                ? { ...f, status: 'done', response: { ossKey: data.key }, fileType }
                                : f
                            )
                        );

                        return {
                            type: 'supporting',
                            uid: fileUid,
                            originalName,
                            ossKey: data.key,
                            fileType
                        };

                    } catch (error) {
                        console.error(`Upload failed for ${originalName}:`, error);
                        
                        // Update UI state
                        setSupportingFileList(prev => 
                            prev.map(f => f.uid === fileUid 
                                ? { ...f, status: 'error', error: error as Error }
                                : f
                            )
                        );

                        return {
                            type: 'supporting',
                            uid: fileUid,
                            originalName,
                            error: error as Error,
                            fileType
                        };
                    }
                };

                uploadTasks.push(task());
            }
        });

        // Prepare vehicle file upload task (single file)
        vehicleFileList.forEach(file => {
            if (file.originFileObj && file.status !== 'done') {
                const task = async (): Promise<UploadResult> => {
                    const fileUid = file.uid;
                    const originalName = file.name;

                    try {
                        // Validate file
                        const validationError = validateFile(file.originFileObj as RcFile);
                        if (validationError) {
                            throw new Error(validationError);
                        }

                        // Get presigned URL for vehicle document
                        const { data } = await axios.get(`${apiBase}/presigned`, {
                            params: {
                                registerId: residentId,
                                fileType: 'plate',
                                plateNumber: encodeURIComponent(values.plateNumber),
                                fileName: file.name,
                                contentType: file.type || 'application/octet-stream'
                            }
                        });

                        // Upload to OSS
                        await putFileToOSS(data.url, file.originFileObj as RcFile,
                            (event) => updateProgress(event, fileUid));

                        // Update UI state
                        setVehicleFileList(prev => 
                            prev.map(f => f.uid === fileUid
                                ? { ...f, status: 'done', response: { ossKey: data.key } }
                                : f
                            )
                        );

                        return {
                            type: 'vehicle',
                            uid: fileUid,
                            originalName,
                            ossKey: data.key
                        };

                    } catch (error) {
                        console.error(`Upload failed for vehicle document ${originalName}:`, error);
                        
                        // Update UI state
                        setVehicleFileList(prev => 
                            prev.map(f => f.uid === fileUid
                                ? { ...f, status: 'error', error: error as Error }
                                : f
                            )
                        );

                        return {
                            type: 'vehicle',
                            uid: fileUid,
                            originalName,
                            error: error as Error
                        };
                    }
                };

                uploadTasks.push(task());
            }
        });

        // Execute with concurrency control (same as company form)
        const results: UploadResult[] = [];
        const queue = [...uploadTasks];
        
        const worker = async () => {
            while (queue.length > 0) {
                const task = queue.shift();
                if (task) {
                    const result = await task;
                    results.push(result);
                }
            }
        };

        const workers = Array.from({ length: Math.min(config.concurrentUploads, uploadTasks.length) }, 
            () => worker()
        );

        await Promise.allSettled(workers);
        
        setUploadResults(results);
        
        return results;
    };

    // --- Form Submission ---
    const onFinish = async (values: ResidentFormValues) => {
        if (!turnstileToken) {
            message.error('Please complete the security verification.');
            return;
        }
        
        // Check required documents
        const hasSupportingFiles = supportingFileList.length >= 2; // Need SPA and Bill
        const hasVehicleFile = vehicleFileList.length > 0;

        if (!hasSupportingFiles) {
            message.error('Please attach both SPA/Tenancy Agreement and Electricity Bill.');
            return;
        }

        if (!hasVehicleFile) {
            message.error('Please attach vehicle document.');
            return;
        }

        setUploading(true);
        setUploadProgress({});
        setUploadResults([]);

        try {
            // Step 1: Create Resident
            message.loading('Creating resident record...', 0);
            const createResponse = await axios.post<CreateResidentResponse>(
                `${apiBase}/registers/resident`,
                {
                    residentName: values.residentName,
                    contactNumber: values.contactNumber,
                    contactEmail: values.contactEmail,
                    residentAddressLine1: values.residentAddressLine1,
                    residentAddressLine2: values.residentAddressLine2,
                    plateNumber: values.plateNumber,
                    vehicleType: values.vehicleType,
                    residentPlate: {
                        plateNumber: values.plateNumber,
                        vehicleType: values.vehicleType,
                    }
                } as CreateResidentRequest
            );

            const residentId = createResponse.data.id;
            message.destroy();
            message.success(`Resident created (ID: ${residentId}). Starting uploads...`);

            // Step 2: Upload Files
            const results = await processUploadQueue(residentId, values);

            // Analyze results
            const successfulUploads = results.filter(r => r.ossKey && !r.error);
            const failedUploads = results.filter(r => r.error);
            
            console.log('Upload Results:', {
                total: results.length,
                successful: successfulUploads.length,
                failed: failedUploads.length,
                results
            });

            if (failedUploads.length > 0) {
                const failedNames = failedUploads.map(r => r.originalName).join(', ');
                throw new Error(`${failedUploads.length} file(s) failed to upload: ${failedNames}`);
            }

            if (successfulUploads.length !== results.length) {
                throw new Error('Not all files were successfully uploaded.');
            }

            message.success(`All ${successfulUploads.length} files uploaded successfully!`);

            // Step 3: Prepare finalization data
            // Get vehicle document
            const vehicleUpload = successfulUploads.find(r => r.type === 'vehicle');
            if (!vehicleUpload || !vehicleUpload.ossKey) {
                throw new Error('Vehicle document not found in successful uploads');
            }

            // Get supporting documents
            const supportingFiles: SupportingFileEntry[] = successfulUploads
                .filter(r => r.type === 'supporting' && r.ossKey && r.fileType)
                .map(result => ({
                    fileKey: result.ossKey!,
                    type: result.fileType!
                }));

            // Step 4: Finalize Resident
            message.loading('Finalizing resident registration...', 0);
            const finalizeResponse = await axios.post<FinalizeResidentResponse>(
                `${apiBase}/registers/resident/finalize`,
                {
                    residentName: values.residentName,
                    contactNumber: values.contactNumber,
                    contactEmail: values.contactEmail,
                    residentAddressLine1: values.residentAddressLine1,
                    residentAddressLine2: values.residentAddressLine2,
                    plateNumber: values.plateNumber,
                    vehicleType: values.vehicleType,
                    residentPlate: {
                        plateNumber: values.plateNumber,
                        vehicleType: values.vehicleType,
                        fileKey: vehicleUpload.ossKey
                    },
                    residentSupportingFiles: supportingFiles,
                } as FinalizeResidentRequest
            );

            message.destroy();
            message.success(`Resident ${finalizeResponse.data.id} finalized successfully!`);

            // Show success summary
            message.success('Submission Complete');

            // Reset form
            form.resetFields();
            setSupportingFileList([]);
            setVehicleFileList([]);
            setUploadProgress({});
            setUploadResults([]);
            setTurnstileToken(null);

        } catch (error) {
            console.error('Submission failed:', error);
            message.destroy();
            
            if (axios.isAxiosError(error)) {
                if (error.response?.data?.errors?.errors) {
                    // Handle the array of field errors
                    const fieldErrors = error.response.data.errors.errors;
                    const errorMessages = fieldErrors.map((err: any) => `${err.field}: ${err.message}`);
                    message.error(`Validation failed: ${errorMessages.join(', ')}`);
                } else if (error.response?.data?.errors?.message) {
                    // Show the general validation message
                    message.error(`Validation error: ${error.response.data.errors.message}`);
                } else if (error.response?.data?.message) {
                    message.error(`Error: ${error.response.data.message}`);
                } else if (error.response?.data?.error) {
                    message.error(`Error: ${error.response.data.error}`);
                } else {
                    message.error(`Server error: ${error.message}`);
                }
            } else if (error instanceof Error) {
                message.error(`Error: ${error.message}`);
            } else {
                message.error('An unknown error occurred');
            }
                    } finally {
            setUploading(false);
        }
    };

    // --- Render Upload Status ---
    const renderUploadStatus = () => {
        if (uploadResults.length === 0) return null;

        const successful = uploadResults.filter(r => r.ossKey).length;
        const failed = uploadResults.filter(r => r.error).length;
        const total = uploadResults.length;

        return (
            <Card size="small" style={{ marginBottom: 16 }}>
                <Space style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong>Upload Status</Text>
                        <Text type={failed > 0 ? "danger" : "success"}>
                            {successful}/{total} successful
                        </Text>
                    </div>
                    
                    {uploadResults.map((result, index) => (
                        <div key={index} style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '4px 0',
                            borderBottom: '1px solid #f0f0f0'
                        }}>
                            <Space>
                                {result.ossKey ? (
                                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                ) : (
                                    <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                                )}
                                <Text>{result.originalName}</Text>
                                <Tag color={result.type === 'vehicle' ? "blue" : "green"}>
                                    {result.type === 'vehicle' ? 'Vehicle Doc' : 
                                     result.fileType === 'spa' ? 'SPA/Tenancy' : 'Electricity Bill'}
                                </Tag>
                            </Space>
                            <Text type={result.ossKey ? "success" : "danger"}>
                                {result.ossKey ? '✓' : `✗ ${result.error?.message}`}
                            </Text>
                        </div>
                    ))}
                </Space>
            </Card>
        );
    };

    return (
        <Layout style={{ padding: '2rem', minHeight: '100vh', background: '#f0f2f5' }}>
            <Card style={{ width: '100%', maxWidth: 800, margin: '0 auto' }}>
                {/* Back Button */}
                <div style={{ textAlign: 'left' }}>
                    <Button
                        icon={<ArrowLeftOutlined />}
                        onClick={() => window.history.back()}
                        style={{ marginBottom: 20 }}
                    >
                        Back
                    </Button>
                </div>

                {/* Title */}
                <Title level={2} style={{ textAlign: 'center', marginBottom: 30 }}>
                    Resident Registration
                </Title>

                {/* Upload Status Summary */}
                {renderUploadStatus()}

                {/* Main Form */}
                <Form
                    form={form}
                    onFinish={onFinish}
                    disabled={uploading}
                    layout="vertical"
                    initialValues={{ 
                        consentPDPA: false, 
                        consentTOC: false 
                    }}
                >
                    {/* Resident Details */}
                    <Form.Item
                        name="residentName"
                        label="Resident Name"
                        rules={[{ required: true, message: 'Required' }]}
                    >
                        <Input 
                            placeholder="Enter Resident Name" 
                            size="large" 
                        />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="contactNumber"
                                label="Contact Number"
                                rules={[{ required: true, message: 'Required' }]}
                            >
                                <Input placeholder="Enter Contact Number" size="large" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="contactEmail"
                                label="Email Address"
                                rules={[{ 
                                    required: true, 
                                    message: 'Required',
                                    type: 'email',
                                }]}
                            >
                                <Input placeholder="Enter Email Address" size="large" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        name="residentAddressLine1"
                        label="Resident Address Line 1"
                        rules={[{ required: true, message: 'Required' }]}
                    >
                        <Input 
                            placeholder="Resident Address Line 1" 
                            size="large" 
                        />
                    </Form.Item>

                    <Form.Item
                        name="residentAddressLine2"
                        label="Resident Address Line 2"
                    >
                        <Input 
                            placeholder="Resident Address Line 2" 
                            size="large" 
                        />
                    </Form.Item>

                    <Divider>
                        Vehicle Information
                    </Divider>

                    {/* Single Vehicle Info with Vehicle Type Select */}
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="plateNumber"
                                label="Plate Number"
                                rules={[{ required: true, message: 'Required' }]}
                            >
                                <Input 
                                    placeholder="Enter Plate Number" 
                                    size="large" 
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="vehicleType"
                                label="Vehicle Type"
                                rules={[{ required: true, message: 'Required' }]}
                            >
                                <Select 
                                    placeholder="Select Vehicle Type" 
                                    size="large"
                                >
                                    {vehicleOptions.map(option => (
                                        <Select.Option key={option.value} value={option.value}>
                                            {option.label}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Vehicle Document Upload */}
                    <Form.Item
                        label="Vehicle Document"
                        extra="Upload vehicle registration or related document"
                    >
                        <Upload
                            name="vehicleFile"
                            maxCount={1}
                            fileList={vehicleFileList}
                            onChange={handleVehicleFileChange}
                            beforeUpload={() => false}
                            customRequest={dummyRequest}
                            listType="picture"
                            disabled={uploading}
                        >
                            <Button 
                                icon={<UploadOutlined />}
                                disabled={uploading}
                            >
                                Upload Vehicle Document
                            </Button>
                        </Upload>
                        
                        {/* Progress for vehicle file */}
                        {uploading && vehicleFileList.map(file => (
                            uploadProgress[file.uid] !== undefined && (
                                <div key={file.uid} style={{ marginTop: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Text style={{ fontSize: 12 }}>
                                            {file.name}
                                            {file.status === 'done' && (
                                                <Tag color="success" style={{ marginLeft: 8 }}>Uploaded</Tag>
                                            )}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {uploadProgress[file.uid]}%
                                        </Text>
                                    </div>
                                    <Progress
                                        percent={uploadProgress[file.uid]}
                                        size="small"
                                        status={file.status === 'error' ? 'exception' : 'active'}
                                    />
                                </div>
                            )
                        ))}
                    </Form.Item>

                    <Divider>
                        Supporting Documents
                    </Divider>

                    {/* Supporting Files Upload - Simplified */}
                    <Form.Item
                        label="Required Documents (SPA/Tenancy Agreement & Electricity Bill)"
                        extra={`Upload both documents. Max ${config.maxGeneralFiles} files total. Allowed: PDF, JPG, PNG. Max size: ${config.maxFileSizeMB}MB`}
                    >
                        <Dragger
                            name="supportingFiles"
                            multiple
                            maxCount={config.maxGeneralFiles}
                            fileList={supportingFileList}
                            onChange={handleSupportingFileChange}
                            beforeUpload={() => false}
                            customRequest={dummyRequest}
                            listType="picture"
                            disabled={uploading}
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">
                                Click or drag files to upload SPA/Tenancy Agreement and Electricity Bill
                            </p>
                            <p className="ant-upload-hint">
                                Upload both required documents
                            </p>
                        </Dragger>
                    </Form.Item>

                    {/* Progress Bars for Supporting Files */}
                    {uploading && supportingFileList.map(file => (
                        uploadProgress[file.uid] !== undefined && (
                            <div key={file.uid} style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 12 }}>
                                        {file.name}
                                        {file.status === 'done' && (
                                            <Tag color="success" style={{ marginLeft: 8 }}>Uploaded</Tag>
                                        )}
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {uploadProgress[file.uid]}%
                                    </Text>
                                </div>
                                <Progress
                                    percent={uploadProgress[file.uid]}
                                    size="small"
                                    status={file.status === 'error' ? 'exception' : 'active'}
                                />
                            </div>
                        )
                    ))}

                    <Divider>Terms and Conditions</Divider>

                    <Form.Item
                        name="consentPDPA"
                        valuePropName="checked"
                        rules={[{ required: true, message: 'You must consent to data processing' }]}
                        style={{ textAlign: 'left' }}
                    >
                        <Checkbox>
                            I have read, understood, voluntarily and unconditionally consented to the collection, usage, processing and storage of my personal data in the manner and for the purposes described in the Personal Data Processing Statement
                        </Checkbox>
                    </Form.Item>

                    <Form.Item
                        name="consentTOC"
                        valuePropName="checked"
                        rules={[{ required: true, message: 'You must accept the Terms and Conditions' }]}
                        style={{ textAlign: 'left' }}
                    >
                        <Checkbox>
                            I have read, understood, voluntarily and unconditionally agreed and accepted the Terms and Conditions
                        </Checkbox>
                    </Form.Item>

                    <Form.Item style={{ marginTop: 24 }}>
                        <div style={{ textAlign: 'center' }}>
                            <Turnstile
                                siteKey={siteKey}
                                onSuccess={(token) => setTurnstileToken(token)}
                                onError={() => {
                                    setTurnstileToken(null);
                                    message.error('Security verification failed');
                                }}
                                onExpire={() => setTurnstileToken(null)}
                                options={{
                                    theme: 'light',
                                    size: 'normal'
                                }}
                            />
                        </div>
                    </Form.Item>

                    {/* Submit Button */}
                    <Form.Item style={{ marginTop: 24 }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            block
                            loading={uploading}
                            disabled={!turnstileToken}
                            icon={uploading ? null : <CheckCircleOutlined />}
                        >
                            {uploading ? 'Processing...' : 'Submit Registration'}
                        </Button>
                    </Form.Item>

                    {/* Status Alert */}
                    {uploadResults.length > 0 && (
                        <Alert
                            message="Upload Summary"
                            description={
                                <div>
                                    <p>Total files processed: {uploadResults.length}</p>
                                    <p>Successful: <Tag color="success">{uploadResults.filter(r => r.ossKey).length}</Tag></p>
                                    <p>Failed: <Tag color="error">{uploadResults.filter(r => r.error).length}</Tag></p>
                                </div>
                            }
                            type={uploadResults.some(r => r.error) ? "warning" : "success"}
                            showIcon
                            style={{ marginTop: 16 }}
                        />
                    )}
                </Form>
            </Card>
        </Layout>
    );
}