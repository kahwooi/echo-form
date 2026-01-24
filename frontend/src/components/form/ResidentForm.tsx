import {
    InboxOutlined,
    ArrowLeftOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    InfoCircleOutlined,
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
    Tag,
    Space,
    Select,
    Checkbox,
    Grid,
    Spin,
    Tooltip
} from "antd";
import type { RcFile } from "antd/es/upload";
import Dragger from "antd/es/upload/Dragger";
import axios, { type AxiosProgressEvent } from "axios";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { InfoModal } from "../ui/InfoModal";

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const { Content } = Layout;

// --- Types ---
type CustomUploadFile = UploadFile & {
    response?: {
        ossKey: string;
    };
};

type ResidentFormValues = {
    residentName: string;
    nricNumber?: string;
    tinNumber?: string;
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
    nricNumber?: string;
    tinNumber?: string;
    contactNumber: string;
    contactEmail: string;
    residentAddressLine1: string;
    residentAddressLine2?: string;
    plateNumber: string;
    vehicleType: string;
}

interface CreateResidentResponse {
    success: boolean;
    message: string;
    data: {
        registerID: string;
    };
}

interface PlateFileEntry {
    plateNumber: string;
    vehicleType: string;
    vehiclePath: string;
}

interface SupportingFileEntry {
    spaPath: string;
    electricBillPath: string;
}

interface FinalizeResidentRequest {
    residentName: string;
    nricNumber?: string;
    tinNumber?: string;
    contactNumber: string;
    contactEmail: string;
    residentAddressLine1: string;
    residentAddressLine2?: string;
    plateNumber: string;
    vehicleType: string;
    residentPlate: PlateFileEntry;
    residentSupportingFiles: SupportingFileEntry;
}

interface FinalizeResidentResponse {
    id: string;
}

interface UploadResult {
    type: 'electricity' | 'spa' | 'vehicle';
    uid: string;
    originalName: string;
    ossKey?: string;
    error?: Error;
}

interface UploadTokenResponse {
  success: boolean;
  message: string;
  data: {
    uploadToken: string;
    expiresIn: number;
  };
}

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
const apiBase = process.env.BUN_PUBLIC_OPP_API_BASE;
const apiParkingBase = process.env.BUN_PUBLIC_PARKING_API_BASE;
const siteKey = process.env.BUN_PUBLIC_TURNSTILE_SITE_KEY || '';

export function ResidentForm() {
    const [form] = Form.useForm();
    const screens = useBreakpoint();
    const [searchParams] = useSearchParams();
    const [configLoading, setConfigLoading] = useState(true);
    const [config, setConfig] = useState({
        maxGeneralFiles: 1,
        concurrentUploads: 2,
        maxFileSizeMB: 100,
        allowedTypes: ['image/', 'application/pdf'],
        enableRegistration: true,
    });

    // State for files
    const [vehicleFileList, setVehicleFileList] = useState<CustomUploadFile[]>([]);
    const [spaFileList, setSpaFileList] = useState<CustomUploadFile[]>([]);
    const [electricityBillFileList, setElectricityBillFileList] = useState<CustomUploadFile[]>([]);
    
    // Upload state
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

    // Info Modal state
    const [modalConfig, setModalConfig] = useState<{
        open: boolean;
        title: string;
        content?: ReactNode;
        image?: string;
    }>({ open: false, title: '' });

    const [uploadToken, setUploadToken] = useState<string | null>(null);

    // Responsive configuration
    const getResponsiveConfig = () => {
        return {
            // Layout configuration
            layout: {
                // Padding
                containerPadding: screens.xs ? '16px' : screens.sm ? '20px' : '24px',
                cardPadding: screens.xs ? '16px' : '24px',
                
                // Spacing
                gutter: screens.xs ? 16 : screens.sm ? 20 : 24,
                
                // Max width
                maxWidth: screens.xs ? '100%' : screens.sm ? '70%' : screens.md ? '70%' : '1000px',
                
                // Column configuration for form
                formColumns: {
                    xs: 24,
                    sm: 24,
                    md: 12,
                    lg: 12,
                    xl: 12
                }
            },
            
            // Typography
            typography: {
                titleSize: screens.xs ? '1.5rem' : screens.sm ? '1.75rem' : '2rem',
                textSize: screens.xs ? '14px' : '16px'
            }
        };
    };

    const responsiveConfig = getResponsiveConfig();

    // Fetch config
    useEffect(() => {
        const parkingLocationId = searchParams.get('id');
        const fetchConfig = async () => {
            try {
                const response = await axios.get(`${apiParkingBase}/api/public/parking-locations/settings`,{
                    params: {
                        id: parkingLocationId
                    }
                });
                setConfig(prevConfig => ({
                    ...prevConfig,
                    enableRegistration: response.data.enable_registration || false,
                }));
            } catch (error) {
                console.error("Failed to fetch config:", error);
                setConfig(prevConfig => ({
                    ...prevConfig,
                    enableRegistration: false,
                }));
            } finally  {
                setConfigLoading(false);
            }
        };
        fetchConfig();
    }, []);

    // --- File Handlers ---
    const handleVehicleFileChange: UploadProps['onChange'] = ({ fileList }) => {
        setVehicleFileList(fileList as CustomUploadFile[]);
    };

    const handleSpaFileChange: UploadProps['onChange'] = ({ fileList }) => {
        setSpaFileList(fileList as CustomUploadFile[]);
    }
    
    const handleElectricityBillFileChange: UploadProps['onChange'] = ({ fileList }) => {
        setElectricityBillFileList(fileList as CustomUploadFile[]);
    };

    const dummyRequest: UploadProps['customRequest'] = ({ onSuccess }) => {
        setTimeout(() => { if (onSuccess) onSuccess("ok"); }, 0);
    };

    // --- Upload Functions ---
    const putFileToOSS = async (signedUrl: string, file: RcFile, onProgress?: (event: AxiosProgressEvent) => void) => {
        const { data } = await axios.put(signedUrl, file, {
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
            const maxSize = (config.maxFileSizeMB || 100) * 1024 * 1024;
            if (file.size > maxSize) {
                return `File size exceeds ${config.maxFileSizeMB || 100}MB limit`;
            }

            // Check if file has a type
            if (!file.type) {
                const fileName = file.name.toLowerCase();
                const extension = fileName.split('.').pop();
                
                const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
                if (extension && !allowedExtensions.some(ext => fileName.endsWith(ext))) {
                    return 'File type not recognized. Allowed: PDF, JPG, PNG';
                }
                return null;
            }

            // Check file type against allowed types
            const allowedTypes = config.allowedTypes || ['image/', 'application/pdf'];
            const isAllowed = allowedTypes.some(allowedType => 
                file.type?.startsWith(allowedType)
            );
            
            if (!isAllowed) {
                const fileName = file.name.toLowerCase();
                const isExtensionAllowed = 
                    fileName.endsWith('.pdf') || 
                    fileName.endsWith('.jpg') || 
                    fileName.endsWith('.jpeg') || 
                    fileName.endsWith('.png')
                
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

        // Prepare vehicle file upload task
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
                                contentType: file.type || 'application/octet-stream',
                                turnstileToken: turnstileToken
                            },
                            headers: {
                                Authorization: `Bearer ${uploadToken}`
                            }
                        });

                        // Upload to OSS
                        await putFileToOSS(data.data.url, file.originFileObj as RcFile,
                            (event) => updateProgress(event, fileUid));

                        // Update UI state
                        setVehicleFileList(prev => 
                            prev.map(f => f.uid === fileUid
                                ? { ...f, status: 'done', response: { ossKey: data.data.key } }
                                : f
                            )
                        );

                        return {
                            type: 'vehicle',
                            uid: fileUid,
                            originalName,
                            ossKey: data.data.key
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

        // Prepare SPA/Tenancy Agreement file upload task
        spaFileList.forEach((file, index) => {
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

                        // Get presigned URL for supporting document
                        const { data } = await axios.get(`${apiBase}/presigned`, {
                            params: {
                                registerId: residentId,
                                fileType: 'general',
                                fileName: file.name,
                                contentType: file.type || 'application/octet-stream',
                                turnstileToken: turnstileToken
                            },
                            headers: {
                                Authorization: `Bearer ${uploadToken}`
                            }
                        });

                        // Upload to OSS
                        await putFileToOSS(data.data.url, file.originFileObj as RcFile, 
                            (event) => updateProgress(event, fileUid));

                        // Update UI state
                        setSpaFileList(prev => 
                            prev.map(f => f.uid === fileUid
                                ? { ...f, status: 'done', response: { ossKey: data.data.key } }
                                : f
                            )
                        );

                        return {
                            type: 'spa',
                            uid: fileUid,
                            originalName,
                            ossKey: data.data.key
                        };

                    } catch (error) {
                        console.error(`Upload failed for SPA/Tenancy Agreement ${originalName}:`, error);

                        // Update UI state
                        setSpaFileList(prev => 
                            prev.map(f => f.uid === fileUid
                                ? { ...f, status: 'error', error: error as Error }
                                : f
                            )
                        );

                        return {
                            type: 'spa',
                            uid: fileUid,
                            originalName,
                            error: error as Error
                        };
                    }
                };

                uploadTasks.push(task());
            }
        });

        // Prepare electricity bill file upload task
        electricityBillFileList.forEach((file, index) => {
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

                        // Get presigned URL for supporting document
                        const { data } = await axios.get(`${apiBase}/presigned`, {
                            params: {
                                registerId: residentId,
                                fileType: 'general',
                                fileName: file.name,
                                contentType: file.type || 'application/octet-stream',
                                turnstileToken: turnstileToken
                            },
                            headers: {
                                Authorization: `Bearer ${uploadToken}`
                            }
                        });

                        // Upload to OSS
                        await putFileToOSS(data.data.url, file.originFileObj as RcFile, 
                            (event) => updateProgress(event, fileUid));

                        // Update UI state
                        setElectricityBillFileList(prev => 
                            prev.map(f => f.uid === fileUid 
                                ? { ...f, status: 'done', response: { ossKey: data.data.key } }
                                : f
                            )
                        );

                        return {
                            type: 'electricity',
                            uid: fileUid,
                            originalName,
                            ossKey: data.data.key
                        };

                    } catch (error) {
                        console.error(`Upload failed for ${originalName}:`, error);
                        
                        // Update UI state
                        setElectricityBillFileList(prev => 
                            prev.map(f => f.uid === fileUid 
                                ? { ...f, status: 'error', error: error as Error }
                                : f
                            )
                        );

                        return {
                            type: 'electricity',
                            uid: fileUid,
                            originalName,
                            error: error as Error,
                        };
                    }
                };

                uploadTasks.push(task());
            }
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

        const workers = Array.from({ length: Math.min(config.concurrentUploads, uploadTasks.length) }, 
            () => worker()
        );

        await Promise.allSettled(workers);
        
        setUploadResults(results);
        
        return results;
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
                                <Text>
                                    {result.originalName}
                                    <Tag color={getTagColor(result.type)} style={{ marginLeft: 8 }}>
                                        {getDocumentTypeLabel(result.type)}
                                    </Tag>
                                </Text>
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

    // Helper function to get tag color based on document type
    const getTagColor = (type: UploadResult['type']) => {
        switch (type) {
            case 'vehicle': return 'blue';
            case 'spa': return 'green';
            case 'electricity': return 'orange';
            default: return 'default';
        }
    };

    // Helper function to get document type label
    const getDocumentTypeLabel = (type: UploadResult['type']) => {
        switch (type) {
            case 'vehicle': return 'Vehicle';
            case 'spa': return 'SPA/Tenancy';
            case 'electricity': return 'Electricity Bill';
            default: return type;
        }
    };

    // --- Get Upload Token ---
    const getUploadToken = async (turnstileToken: string): Promise<string> => {
        try {
            const response = await axios.post<UploadTokenResponse>(
                `${apiBase}/upload-token`,
                { turnstileToken }
            );
            
            if (response.data.success && response.data.data.uploadToken) {
            return response.data.data.uploadToken;
            }
            throw new Error('Failed to get upload token');
        } catch (error) {
            console.error('Error getting upload token:', error);
            throw error;
        }
    };

    // --- Form Submission ---
    const onFinish = async (values: ResidentFormValues) => {
        if (!turnstileToken) {
            message.error('Please complete the security verification.');
            return;
        }
        
        // Check required documents
        const hasVehicleFile = vehicleFileList.length > 0;
        const hasSpaFile = spaFileList.length > 0;
        const hasElectricityBill = electricityBillFileList.length > 0;

        if (!hasVehicleFile) {
            message.error('Please attach vehicle document.');
            return;
        }

        if (!hasSpaFile) {
            message.error('Please attach SPA or Tenancy Agreement document.');
            return;
        }

        if (!hasElectricityBill) {
            message.error('Please attach Electricity Bill document.');
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
                    nricNumber: values.nricNumber,
                    tinNumber: values.tinNumber,
                    contactNumber: values.contactNumber,
                    contactEmail: values.contactEmail,
                    residentAddressLine1: values.residentAddressLine1,
                    residentAddressLine2: values.residentAddressLine2,
                    plateNumber: values.plateNumber,
                    vehicleType: values.vehicleType,
                } as CreateResidentRequest
            );

            const residentId = createResponse.data.data.registerID;
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
            const vehicleUpload = successfulUploads.find(r => r.type === 'vehicle');
            const spaUpload = successfulUploads.find(r => r.type === 'spa');
            const electricityUpload = successfulUploads.find(r => r.type === 'electricity');
            
            if (!vehicleUpload || !vehicleUpload.ossKey) {
                throw new Error('Vehicle document not found in successful uploads');
            }

            if (!spaUpload || !spaUpload.ossKey) {
                throw new Error('SPA/Tenancy Agreement document not found');
            }
            
            if (!electricityUpload || !electricityUpload.ossKey) {
                throw new Error('Electricity Bill document not found');
            }

            // Step 4: Finalize Resident
            message.loading('Finalizing resident registration...', 0);
            const finalizeResponse = await axios.post<FinalizeResidentResponse>(
                `${apiBase}/registers/resident/finalize`,
                {
                    residentName: values.residentName,
                    nricNumber: values.nricNumber,
                    tinNumber: values.tinNumber,
                    contactNumber: values.contactNumber,
                    contactEmail: values.contactEmail,
                    residentAddressLine1: values.residentAddressLine1,
                    residentAddressLine2: values.residentAddressLine2,
                    plateNumber: values.plateNumber,
                    vehicleType: values.vehicleType,
                    residentPlate: {
                        plateNumber: values.plateNumber,
                        vehicleType: values.vehicleType,
                        vehiclePath: vehicleUpload.ossKey
                    },
                    residentSupportingFiles: {
                        spaPath: spaUpload.ossKey,
                        electricBillPath: electricityUpload.ossKey
                    },
                } as FinalizeResidentRequest
            );

            message.destroy();
            message.success(`Resident ${finalizeResponse.data.id} finalized successfully!`);

            // Show success summary
            message.success('Submission Complete');

            // Reset form
            form.resetFields();
            setVehicleFileList([]);
            setSpaFileList([]);
            setElectricityBillFileList([]);
            setUploadProgress({});
            setUploadResults([]);
            setTurnstileToken(null);

        } catch (error) {
            console.error('Submission failed:', error);
            message.destroy();
            
            if (axios.isAxiosError(error)) {
                if (error.response?.data?.errors?.errors) {
                    const fieldErrors = error.response.data.errors.errors;
                    const errorMessages = fieldErrors.map((err: any) => `${err.field}: ${err.message}`);
                    message.error(`Validation failed: ${errorMessages.join(', ')}`);
                } else if (error.response?.data?.errors?.message) {
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

    // Show loading state while config is being fetched
    if (configLoading) {
        return (
            <Layout style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <Card style={{ textAlign: 'center', padding: '40px' }}>
                        <Spin size="large" />
                        <div style={{ fontSize: '24px', marginBottom: '16px' }}>Loading...</div>
                    </Card>
                </Content>
            </Layout>
        );
    }

    // Show registration closed message
    if (!config.enableRegistration) {
         return (
            <Layout
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            }}
        >
                <Content
                    style={{
                        padding: responsiveConfig.layout.containerPadding,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'auto',
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            maxWidth: responsiveConfig.layout.maxWidth,
                            margin: '0 auto',
                        }}
                    >
                        <Card
                            style={{
                                width: '100%',
                                background: 'white',
                                borderRadius: screens.xs ? '12px' : '16px',
                                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
                                padding: responsiveConfig.layout.cardPadding,
                            }}
                        >
                            <Title level={3} style={{textAlign: 'center'}}>Registration Closed</Title>
                            <Text style={{ display: 'block', textAlign: 'center' }}>Resident registration is currently disabled.</Text>
                        </Card>
                    </div>
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
                    padding: responsiveConfig.layout.containerPadding,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'auto',
                }}
            >
                <div
                    style={{
                        width: '100%',
                        maxWidth: responsiveConfig.layout.maxWidth,
                        margin: '0 auto',
                    }}
                >
                    <Card
                        style={{
                            width: '100%',
                            background: 'white',
                            borderRadius: screens.xs ? '12px' : '16px',
                            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
                            padding: responsiveConfig.layout.cardPadding,
                        }}
                    >
                        {/* Back Button */}
                        <div style={{ textAlign: 'left', marginBottom: screens.xs ? 16 : 24 }}>
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => window.history.back()}
                                type="default"
                                size={screens.xs ? 'middle' : 'large'}
                                style={{
                                    borderRadius: '8px',
                                }}
                            >
                                Back
                            </Button>
                        </div>

                        {/* Title */}
                        <Title 
                            level={2} 
                            style={{ 
                                textAlign: 'center', 
                                marginBottom: screens.xs ? 24 : 32,
                                fontSize: responsiveConfig.typography.titleSize,
                                color: '#1890ff'
                            }}
                        >
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
                            <Row gutter={responsiveConfig.layout.gutter}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="residentName"
                                        label="Resident Name"
                                        rules={[{ required: true, message: 'Required' }]}
                                    >
                                        <Input 
                                            placeholder="Enter Resident Name" 
                                            size={screens.xs ? 'middle' : 'large'}
                                            style={{ borderRadius: '8px' }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={responsiveConfig.layout.gutter}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="nricNumber"
                                        label={
                                            <span>
                                                NRIC/Passport Number{' '}
                                                <Tooltip title="Enter your National Registration Identity Card number or Passport number">
                                                    <InfoCircleOutlined 
                                                        style={{ color: '#1890ff', cursor: 'pointer' }} 
                                                        onClick={() => setModalConfig({
                                                            open: true,
                                                            title: 'NRIC/Passport Information',
                                                            content: <p>Enter your National Registration Identity Card number or Passport number for identification purposes.</p>,
                                                        })}
                                                    />
                                                </Tooltip>
                                            </span>
                                        }
                                        rules={[{ required: false, message: 'Optional' }]}
                                    >
                                        <Input 
                                            placeholder="Enter NRIC/Passport Number" 
                                            size={screens.xs ? 'middle' : 'large'}
                                            style={{ borderRadius: '8px' }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="tinNumber"
                                        label="Tax Identification Number (TIN)"
                                        rules={[{ required: false, message: 'Optional' }]}
                                    >
                                        <Input
                                            placeholder="Enter TIN"
                                            size={screens.xs ? 'middle' : 'large'}
                                            style={{ borderRadius: '8px' }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={responsiveConfig.layout.gutter}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="contactNumber"
                                        label="Contact Number"
                                        rules={[{ required: true, message: 'Required' }]}
                                    >
                                        <Input 
                                            placeholder="Enter Contact Number" 
                                            size={screens.xs ? 'middle' : 'large'}
                                            style={{ borderRadius: '8px' }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="contactEmail"
                                        label="Email Address"
                                        rules={[{ 
                                            required: true, 
                                            message: 'Required',
                                            type: 'email',
                                        }]}
                                    >
                                        <Input 
                                            placeholder="Enter Email Address" 
                                            size={screens.xs ? 'middle' : 'large'}
                                            style={{ borderRadius: '8px' }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={responsiveConfig.layout.gutter}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="residentAddressLine1"
                                        label="Resident Address Line 1"
                                        rules={[{ required: true, message: 'Required' }]}
                                    >
                                        <Input 
                                            placeholder="Resident Address Line 1" 
                                            size={screens.xs ? 'middle' : 'large'}
                                            style={{ borderRadius: '8px' }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="residentAddressLine2"
                                        label="Resident Address Line 2"
                                    >
                                        <Input 
                                            placeholder="Resident Address Line 2" 
                                            size={screens.xs ? 'middle' : 'large'}
                                            style={{ borderRadius: '8px' }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Divider style={{ margin: '24px 0' }}>
                                Vehicle Information
                            </Divider>

                            {/* Vehicle Info */}
                            <Row gutter={responsiveConfig.layout.gutter}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="plateNumber"
                                        label="Plate Number"
                                        rules={[{ required: true, message: 'Required' }]}
                                    >
                                        <Input 
                                            placeholder="Enter Plate Number" 
                                            size={screens.xs ? 'middle' : 'large'}
                                            style={{ borderRadius: '8px' }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="vehicleType"
                                        label="Vehicle Class"
                                        rules={[{ required: true, message: 'Required' }]}
                                    >
                                        <Select 
                                            placeholder="Select Vehicle Class" 
                                            size={screens.xs ? 'middle' : 'large'}
                                            style={{ borderRadius: '8px' }}
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
                                label="Vehicle Registration Document"
                                extra={`Upload Vehicle Registration or related document. Allowed: PDF, JPG, PNG. Max size: ${config.maxFileSizeMB} MB`}
                            >
                                <Dragger
                                    name="vehicleFile"
                                    maxCount={1}
                                    fileList={vehicleFileList}
                                    onChange={handleVehicleFileChange}
                                    beforeUpload={() => false}
                                    customRequest={dummyRequest}
                                    listType={screens.xs ? "text" : "picture"}
                                    disabled={uploading}
                                    style={{ 
                                        borderRadius: '8px',
                                        background: '#fafafa'
                                    }}
                                >
                                    <p className="ant-upload-drag-icon">
                                        <InboxOutlined style={{ color: '#1890ff' }} />
                                    </p>
                                    <p className="ant-upload-text">
                                        Click or drag file to upload Vehicle Registration Document
                                    </p>
                                </Dragger>
                                
                                {/* Progress for vehicle file */}
                                {uploading && vehicleFileList.map(file => (
                                    uploadProgress[file.uid] !== undefined && (
                                        <div key={file.uid} style={{ marginTop: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Text style={{ fontSize: screens.xs ? '12px' : '14px' }}>
                                                    {file.name}
                                                    {file.status === 'done' && (
                                                        <Tag color="success" style={{ marginLeft: 8 }}>Uploaded</Tag>
                                                    )}
                                                </Text>
                                                <Text type="secondary" style={{ fontSize: screens.xs ? '12px' : '14px' }}>
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

                            <Divider style={{ margin: '24px 0' }}>
                                Supporting Documents
                            </Divider>

                            {/* SPA Document */}
                            <Form.Item
                                label="SPA/Tenancy Agreement"
                                extra={`Upload SPA/Tenancy Agreement. Allowed: PDF, JPG, PNG. Max size: ${config.maxFileSizeMB} MB`}
                            >
                                <Dragger
                                    name="spaFile"
                                    maxCount={config.maxGeneralFiles}
                                    fileList={spaFileList}
                                    onChange={handleSpaFileChange}
                                    beforeUpload={() => false}
                                    customRequest={dummyRequest}
                                    listType={screens.xs ? "text" : "picture"}
                                    disabled={uploading}
                                    style={{ 
                                        borderRadius: '8px',
                                        background: '#fafafa'
                                    }}
                                >
                                    <p className="ant-upload-drag-icon">
                                        <InboxOutlined style={{ color: '#1890ff' }} />
                                    </p>
                                    <p className="ant-upload-text">
                                        Click or drag file to upload SPA/Tenancy Agreement Document
                                    </p>
                                </Dragger>

                                {/* Progress for SPA files */}
                                {uploading && spaFileList.map(file => (
                                    uploadProgress[file.uid] !== undefined && (
                                        <div key={file.uid} style={{ marginTop: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Text style={{ fontSize: screens.xs ? '12px' : '14px' }}>
                                                    {file.name}
                                                    {file.status === 'done' && (
                                                        <Tag color="success" style={{ marginLeft: 8 }}>Uploaded</Tag>
                                                    )}
                                                </Text>
                                                <Text type="secondary" style={{ fontSize: screens.xs ? '12px' : '14px' }}>
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

                            {/* Electricity Bill */}
                            <Form.Item
                                label="Electricity Bill"
                                extra={`Upload Electricity Bill. Allowed: PDF, JPG, PNG. Max size: ${config.maxFileSizeMB} MB`}
                            >
                                <Dragger
                                    name="electricityBillFile"
                                    maxCount={config.maxGeneralFiles}
                                    fileList={electricityBillFileList}
                                    onChange={handleElectricityBillFileChange}
                                    beforeUpload={() => false}
                                    customRequest={dummyRequest}
                                    listType={screens.xs ? "text" : "picture"}
                                    disabled={uploading}
                                    style={{ 
                                        borderRadius: '8px',
                                        background: '#fafafa'
                                    }}
                                >
                                    <p className="ant-upload-drag-icon">
                                        <InboxOutlined style={{ color: '#1890ff' }} />
                                    </p>
                                    <p className="ant-upload-text">
                                        Click or drag files to upload Electricity Bill
                                    </p>
                                </Dragger>

                                {/* Progress for Electricity Bill files */}
                                {uploading && electricityBillFileList.map(file => (
                                    uploadProgress[file.uid] !== undefined && (
                                        <div key={file.uid} style={{ marginTop: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Text style={{ fontSize: screens.xs ? '12px' : '14px' }}>
                                                    {file.name}
                                                    {file.status === 'done' && (
                                                        <Tag color="success" style={{ marginLeft: 8 }}>Uploaded</Tag>
                                                    )}
                                                </Text>
                                                <Text type="secondary" style={{ fontSize: screens.xs ? '12px' : '14px' }}>
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

                            <Divider style={{ margin: '24px 0' }}>
                                Terms and Conditions
                            </Divider>

                            {/* Terms and Conditions - Left Aligned */}
                            <Row gutter={responsiveConfig.layout.gutter}>
                                <Col xs={24}>
                                    <Form.Item
                                        name="consentPDPA"
                                        valuePropName="checked"
                                        rules={[{ required: true, message: 'You must consent to data processing' }]}
                                        style={{ 
                                            textAlign: 'left',
                                            marginBottom: 16 
                                        }}
                                    >
                                        <Checkbox style={{ 
                                            fontSize: responsiveConfig.typography.textSize,
                                            lineHeight: '1.5',
                                            whiteSpace: 'normal'
                                        }}>
                                            I have read, understood, voluntarily and unconditionally consented to the collection, usage, processing and storage of my personal data in the manner and for the purposes described in the Personal Data Processing Statement
                                        </Checkbox>
                                    </Form.Item>
                                </Col>
                                <Col xs={24}>
                                    <Form.Item
                                        name="consentTOC"
                                        valuePropName="checked"
                                        rules={[{ required: true, message: 'You must accept the Terms and Conditions' }]}
                                        style={{ 
                                            textAlign: 'left',
                                            marginBottom: 0 
                                        }}
                                    >
                                        <Checkbox style={{ 
                                            fontSize: responsiveConfig.typography.textSize,
                                            lineHeight: '1.5',
                                            whiteSpace: 'normal'
                                        }}>
                                            I have read, understood, voluntarily and unconditionally agreed and accepted the Terms and Conditions
                                        </Checkbox>
                                    </Form.Item>
                                </Col>
                            </Row>

                            {/* Captcha */}
                            <Form.Item style={{ marginTop: 32 }}>
                                <div style={{ textAlign: 'center' }}>
                                    <Turnstile
                                        siteKey={siteKey}
                                        onSuccess={ async (token) => {
                                            setTurnstileToken(token);
                                             try {
                                                const jwtToken = await getUploadToken(token);
                                                setUploadToken(jwtToken);
                                                message.success('Security verification passed');
                                            } catch (error) {
                                                message.error('Failed to get upload authorization');
                                                setTurnstileToken(null);
                                                setUploadToken(null);
                                            }
                                        }}  
                                        onError={() => {
                                            setTurnstileToken(null);
                                            setUploadToken(null);
                                            message.error('Security verification failed');
                                        }}
                                        onExpire={() => {
                                            setTurnstileToken(null);
                                            setUploadToken(null);
                                            message.error('Security verification expired');
                                        }}
                                        options={{
                                            theme: 'light',
                                            size: screens.xs ? 'compact' : 'normal'
                                        }}
                                    />
                                </div>
                            </Form.Item>

                            {/* Submit Button */}
                            <Form.Item style={{ marginTop: 32 }}>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    size={screens.xs ? 'middle' : 'large'}
                                    block
                                    loading={uploading}
                                    disabled={!uploadToken}
                                    icon={uploading ? null : <CheckCircleOutlined />}
                                    style={{
                                        height: screens.xs ? '44px' : '48px',
                                        borderRadius: '8px',
                                        fontWeight: 600,
                                        fontSize: screens.xs ? '14px' : '16px',
                                        boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)'
                                    }}
                                >
                                    {uploading ? 'Processing...' : 'Submit Registration'}
                                </Button>
                            </Form.Item>
                        </Form>
                    </Card>
                </div>
            </Content>
            <InfoModal
                open={modalConfig.open}
                onClose={() => setModalConfig({ ...modalConfig, open: false })}
                title={modalConfig.title}
                content={modalConfig.content}
                image={modalConfig.image}
            />
        </Layout>
    );
}