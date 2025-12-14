import {
    InboxOutlined,
    MinusCircleOutlined,
    UploadOutlined,
    PlusOutlined,
    ArrowLeftOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined
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
    Upload,
    Divider,
    Row,
    Col,
    Alert,
    Tag,
    Space,
    Spin,
    Select,
    Checkbox
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
};

type CompanyFormValues = {
    companyRegistrationNumber: string;
    taxIdentificationNumber: string;
    companyName: string;
    contactPerson: string;
    contactNumber: string;
    contactEmail: string;
    companyAddressLine1: string;
    companyAddressLine2?: string;
    plateNumbers?: Array<{
        plateNumber: string;
        vehicleType?: string; 
    }>;
}

interface CreateCompanyRequest {
    companyRegistrationNumber: string;
    taxIdentificationNumber: string;
    companyName: string;
    contactPerson: string;
    contactNumber: string;
    contactEmail: string;
    companyAddressLine1: string;
    companyAddressLine2?: string;
    plateNumbers?: Array<{
        plateNumber: string;
        vehicleType?: string; 
    }>;
}

interface CreateCompanyResponse {
    id: string;
}

interface PlateFileEntry {
    plateNumber: string;
    vehicleType: string;
    fileKey: string;
}

interface SupportingFileEntry {
    fileKey: string;
}

interface FinalizeCompanyRequest {
    companyRegistrationNumber: string;
    companyName: string;
    contactPerson: string;
    companyPlates: PlateFileEntry[];
    companySupportingFiles: SupportingFileEntry[];
}

interface FinalizeCompanyResponse {
    id: string;
}

interface UploadResult {
    type: 'general' | 'plate';
    uid: string;
    originalName: string;
    ossKey?: string;
    error?: Error;
    plateIndex?: number;
    plateNumber?: string;
    vehicleType?: string;
}

type PlateFileList = Record<number, CustomUploadFile[]>;

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

export function CompanyForm() {
    const [form] = Form.useForm();
    const [config, setConfig] = useState({
        maxGeneralFiles: 5,
        maxPlateNumbers: 5,
        concurrentUploads: 2,
        maxFileSizeMB: 100,
        allowedTypes: ['image/', 'application/pdf', 'text/plain']
    });

    // State for files
    const [supportingFileList, setSupportingFileList] = useState<CustomUploadFile[]>([]);
    const [plateFilesList, setPlateFilesList] = useState<PlateFileList>({});
    
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
    const handleGeneralFileChange: UploadProps['onChange'] = ({ fileList }) => {
        setSupportingFileList(fileList as CustomUploadFile[]);
    };

    const handlePlateFileChange = (index: number) => ({ fileList }: { fileList: UploadFile[] }) => {
        setPlateFilesList(prev => ({
            ...prev,
            [index]: fileList as CustomUploadFile[]
        }));
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

    // Validate file before upload
    const validateFile = (file: RcFile): string | null => {
        try {
            // Check if config is loaded
            if (!config) {
                return 'Configuration not loaded. Please wait...';
            }

            // Check file size
            const maxSize = (config.maxFileSizeMB || 100) * 1024 * 1024; // Default 100MB
            if (file.size > maxSize) {
                return `File size exceeds ${config.maxFileSizeMB || 100}MB limit`;
            }

            // Check if file has a type
            if (!file.type) {
                // Try to infer from extension for common file types
                const fileName = file.name.toLowerCase();
                const extension = fileName.split('.').pop();
                
                const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.txt'];
                if (extension && !allowedExtensions.some(ext => fileName.endsWith(ext))) {
                    return 'File type not recognized. Allowed: PDF, JPG, PNG, DOC, TXT';
                }
                // If no type but has allowed extension, allow it
                return null;
            }

            // Check file type against allowed types
            const allowedTypes = config.allowedTypes || ['image/', 'application/pdf', 'text/plain'];
            const isAllowed = allowedTypes.some(allowedType => 
                file.type?.startsWith(allowedType)
            );
            
            if (!isAllowed) {
                // Additional check by file extension
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
    const processUploadQueue = async (companyId: string, values: CompanyFormValues): Promise<UploadResult[]> => {
        const uploadTasks: Promise<UploadResult>[] = [];
        const plateNumbers = values.plateNumbers || [];

        // Prepare general file upload tasks
        supportingFileList.forEach(file => {
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

                        // Get presigned URL
                        const { data } = await axios.get(`${apiBase}/presigned`, {
                            params: {
                                registerId: companyId,
                                fileType: 'general',
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
                                ? { ...f, status: 'done', response: { ossKey: data.key } }
                                : f
                            )
                        );

                        return {
                            type: 'general',
                            uid: fileUid,
                            originalName,
                            ossKey: data.key
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
                            type: 'general',
                            uid: fileUid,
                            originalName,
                            error: error as Error
                        };
                    }
                };

                uploadTasks.push(task());
            }
        });

        // Prepare plate file upload tasks
        plateNumbers.forEach((plateNumber, index) => {
            if (!plateNumber.plateNumber || plateNumber.plateNumber.trim() === '') return;

            const filesForRow = plateFilesList[index] || [];
            filesForRow.forEach(file => {
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

                            // Get presigned URL
                            const { data } = await axios.get(`${apiBase}/presigned`, {
                                params: {
                                    registerId: companyId,
                                    fileType: 'plate',
                                    fileName: file.name,
                                    plateNumber: encodeURIComponent(plateNumber.plateNumber),
                                    contentType: file.type || 'application/octet-stream'
                                }
                            });

                            // Upload to OSS
                            await putFileToOSS(data.url, file.originFileObj as RcFile,
                                (event) => updateProgress(event, fileUid));

                            // Update UI state
                            setPlateFilesList(prev => {
                                const currentList = prev[index] || [];
                                return {
                                    ...prev,
                                    [index]: currentList.map(f => f.uid === fileUid
                                        ? { ...f, status: 'done', response: { ossKey: data.key } }
                                        : f
                                    )
                                };
                            });

                            return {
                                type: 'plate',
                                uid: fileUid,
                                originalName,
                                ossKey: data.key,
                                plateIndex: index,
                                plateNumber: plateNumber.plateNumber,
                                vehicleType: plateNumber.vehicleType
                            };

                        } catch (error) {
                            console.error(`Upload failed for ${originalName} (plate ${plateNumber}):`, error);
                            
                            // Update UI state
                            setPlateFilesList(prev => {
                                const currentList = prev[index] || [];
                                return {
                                    ...prev,
                                    [index]: currentList.map(f => f.uid === fileUid
                                        ? { ...f, status: 'error', error: error as Error }
                                        : f
                                    )
                                };
                            });

                            return {
                                type: 'plate',
                                uid: fileUid,
                                originalName,
                                error: error as Error,
                                plateIndex: index,
                                plateNumber: plateNumber.plateNumber,
                                vehicleType: plateNumber.vehicleType
                            };
                        }
                    };

                    uploadTasks.push(task());
                }
            });
        });

        // Execute with concurrency control
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

        // Create workers based on concurrency limit
        const workers = Array.from({ length: Math.min(config.concurrentUploads, uploadTasks.length) }, 
            () => worker()
        );

        await Promise.allSettled(workers);
        
        // Update upload results state
        setUploadResults(results);
        
        return results;
    };

    // --- Form Submission ---
    const onFinish = async (values: CompanyFormValues) => {
        if (!turnstileToken) {
            message.error('Please complete the security verification.');
            return;
        }

        const currentPlateNumbers = values.plateNumbers?.filter(p => p && p.plateNumber.trim() !== '') || [];
        
        // Basic validation
        const hasGeneral = supportingFileList.length > 0;
        const hasPlateFiles = Object.values(plateFilesList).some(list => list.length > 0);

        if (!hasGeneral && !hasPlateFiles) {
            message.error('Please attach at least one file (General or Plate).');
            return;
        }

        setUploading(true);
        setUploadProgress({});
        setUploadResults([]);

        try {
            // Step 1: Create Company
            message.loading('Creating company record...', 0);
            const createResponse = await axios.post<CreateCompanyResponse>(
                `${apiBase}/registers/company`,
                {
                    companyRegistrationNumber: values.companyRegistrationNumber,
                    taxIdentificationNumber: values.taxIdentificationNumber,
                    companyName: values.companyName,
                    contactPerson: values.contactPerson,
                    contactNumber: values.contactNumber,
                    contactEmail: values.contactEmail,
                    companyAddressLine1: values.companyAddressLine1,
                    companyAddressLine2: values.companyAddressLine2,
                    plateNumbers: currentPlateNumbers,

                } as CreateCompanyRequest
            );

            const companyId = createResponse.data.id;
            message.destroy();
            message.success(`Company created (ID: ${companyId}). Starting uploads...`);

            // Step 2: Upload Files
            const results = await processUploadQueue(companyId, values);

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

            if (successfulUploads.length === 0) {
                throw new Error('No files were successfully uploaded.');
            }

            message.success(`All ${successfulUploads.length} files uploaded successfully!`);

            // Step 3: Prepare finalization data
            const companyPlates: PlateFileEntry[] = [];
            const companySupportingFiles: SupportingFileEntry[] = [];

            successfulUploads.forEach(result => {
                if (result.type === 'general' && result.ossKey) {
                    companySupportingFiles.push({ fileKey: result.ossKey });
                } else if (result.type === 'plate' && result.ossKey && result.plateNumber && result.vehicleType) {
                    companyPlates.push({
                        plateNumber: result.plateNumber,
                        vehicleType: result.vehicleType,
                        fileKey: result.ossKey
                    });
                }
            });

            console.log('Final Payload:', {
                companyPlates,
                companySupportingFiles
            });

            // Step 4: Finalize Company
            message.loading('Finalizing company registration...', 0);
            const finalizeResponse = await axios.post<FinalizeCompanyResponse>(
                `${apiBase}/registers/company/finalize`,
                {
                    companyRegistrationNumber: values.companyRegistrationNumber,
                    taxIdentificationNumber: values.taxIdentificationNumber,
                    companyName: values.companyName,
                    contactPerson: values.contactPerson,
                    contactNumber: values.contactNumber,
                    contactEmail: values.contactEmail,
                    companyAddressLine1: values.companyAddressLine1,
                    companyAddressLine2: values.companyAddressLine2,
                    companyPlates,
                    companySupportingFiles,
                } as FinalizeCompanyRequest
            );

            message.destroy();
            message.success(`Company ${finalizeResponse.data.id} finalized successfully!`);

            // Show success summary
            message.success('Submission Complete');

            // Reset form
            form.resetFields();
            setSupportingFileList([]);
            setPlateFilesList({});
            setUploadProgress({});
            setUploadResults([]);
            setTurnstileToken(null);

        } catch (error) {
            console.error('Submission failed:', error);
            message.destroy();
            
            if (axios.isAxiosError(error)) {
                message.error(`Server error: ${error.response?.data?.error || error.message}`);
            } else if (error instanceof Error) {
                message.error(error.message);
            } else {
                message.error('Submission failed due to an unknown error.');
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
                                {result.plateNumber && (
                                    <Tag color="blue">Plate: {result.plateNumber}</Tag>
                                )}
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
            <Card style={{ width: '100%', maxWidth: 1200, margin: '0 auto' }}>
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
                    Company Registration
                </Title>

                {/* Upload Status Summary */}
                {renderUploadStatus()}

                {/* Main Form */}
                <Form
                    form={form}
                    onFinish={onFinish}
                    disabled={uploading}
                    layout="vertical"
                    initialValues={{ plateNumbers: [''] }}
                >
                    {/* Company Details */}
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="companyRegistrationNumber"
                                label="Company Registration Number (SSM)"
                                rules={[{ required: true, message: 'Required' }]}
                            >
                                <Input 
                                    placeholder="Enter Company Registration Number" 
                                    size="large" 
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="taxIdentificationNumber"
                                label="Tax Identification Number (TIN)"
                                rules={[{ required: true, message: 'Required' }]}
                            >
                                <Input
                                    placeholder="Enter TIN"
                                    size="large"
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="companyName"
                                label="Company Name"
                                rules={[{ required: true, message: 'Required' }]}
                            >
                                <Input placeholder="Enter Company Name" size="large" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="contactPerson"
                                label="Contact Person"
                                rules={[{ required: true, message: 'Required' }]}
                            >
                                <Input placeholder="Enter Contact Person" size="large" />
                            </Form.Item>
                        </Col>
                    </Row>

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
                                rules={[{ required: true, message: 'Required' }]}
                            >
                                <Input placeholder="Enter Email Address" size="large" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        name="companyAddressLine1"
                        label="Company Address Line 1"
                        rules={[{ required: true, message: 'Required' }]}
                    >
                        <Input 
                            placeholder="Company Address Line 1" 
                            size="large" 
                        />
                    </Form.Item>

                    <Form.Item
                        name="companyAddressLine2"
                        label="Company Address Line 2"
                        rules={[{ required: false }]}
                    >
                        <Input 
                            placeholder="Company Address Line 2" 
                            size="large" 
                        />
                    </Form.Item>

                    <Divider>
                        Vehicle Plates & Documents
                    </Divider>

                    {/* Dynamic Plate List */}
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
                                                    setPlateFilesList(prev => {
                                                        const copy = { ...prev };
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
                                                name={[name, 'plateNumber']}
                                                rules={[{ required: true, message: 'Required' }]}
                                                style={{ flex: 1, marginBottom: 0 }}
                                            >
                                                <Input 
                                                    placeholder="Enter Plate Number (e.g. WWA 1234)" 
                                                    size="large" 
                                                />
                                            </Form.Item>

                                            <Form.Item
                                                {...restField}
                                                name={[name, 'vehicleType']}
                                                rules={[{ required: true, message: 'Required' }]}
                                                style={{ flex: 1, marginBottom: 0 }}
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

                                            {/* Upload Button */}
                                            <Upload
                                                fileList={plateFilesList[index] || []}
                                                onChange={handlePlateFileChange(index)}
                                                beforeUpload={() => false}
                                                customRequest={dummyRequest}
                                                maxCount={1}
                                                disabled={uploading}
                                            >
                                                <Button 
                                                    size="large" 
                                                    icon={<UploadOutlined />}
                                                    disabled={uploading}
                                                >
                                                    Attach Document
                                                </Button>
                                            </Upload>
                                        </div>

                                        {/* Progress for this row */}
                                        {uploading && (plateFilesList[index] || []).map(file => (
                                            uploadProgress[file.uid] !== undefined && (
                                                <Progress
                                                    key={file.uid}
                                                    percent={uploadProgress[file.uid]}
                                                    size="small"
                                                    status={file.status === 'error' ? 'exception' : 'active'}
                                                    style={{ marginTop: 8 }}
                                                />
                                            )
                                        ))}
                                    </Card>
                                ))}

                                {/* Add More Button */}
                                <Button
                                    type="dashed"
                                    onClick={() => add()}
                                    block
                                    icon={<PlusOutlined />}
                                    disabled={fields.length >= config.maxPlateNumbers || uploading}
                                >
                                    Add Another Vehicle
                                </Button>
                            </div>
                        )}
                    </Form.List>

                    <Divider>
                        General Documents
                    </Divider>

                    {/* General Files Upload */}
                    <Form.Item
                        label="Supporting Documents (SSM, Electricity Bills)"
                        extra={`Max ${config.maxGeneralFiles} files. Allowed: PDF, JPG, PNG. Max size: ${config.maxFileSizeMB}MB`}
                    >
                        <Dragger
                            name="supportingFiles"
                            multiple
                            maxCount={config.maxGeneralFiles}
                            fileList={supportingFileList}
                            onChange={handleGeneralFileChange}
                            beforeUpload={() => false}
                            customRequest={dummyRequest}
                            listType="picture"
                            disabled={uploading}
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">
                                Click or drag files to this area
                            </p>
                            <p className="ant-upload-hint">
                                Support for single or bulk upload
                            </p>
                        </Dragger>
                    </Form.Item>

                    {/* Progress Bars for General Files */}
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
                        name="dataProcessingConsent"
                        valuePropName="checked"
                        rules={[{ required: true, message: 'You must consent to data processing' }]}
                        style={{ textAlign: 'left' }}
                    >
                        <Checkbox>
                            I have read, understood, voluntarily and unconditionally consented to the collection, usage, processing and storage of my personal data in the manner and for the purposes described in the Personal Data Processing Statement
                        </Checkbox>
                    </Form.Item>

                    <Form.Item
                        name="termsAndConditions"
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
                            title="Upload Summary"
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