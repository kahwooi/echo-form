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
    Select,
    Checkbox,
    Grid
} from "antd";
import type { RcFile } from "antd/es/upload";
import Dragger from "antd/es/upload/Dragger";
import axios, { type AxiosProgressEvent } from "axios";
import { useEffect, useState } from "react";

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const { Content } = Layout;

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
    success: boolean;
    message: string;
    data: {
        employerID: string;
        registerID: string;
    };
}

interface PlateFileEntry {
    nricNumber: string;
    plateNumber: string;
    vehicleType: string;
    spaPath: string;
    electricBillPath: string;
    vehiclePath: string;
}

interface SupportingFileEntry {
    ssmPath: string;
    electricBillPath: string;
    vehiclePath: string;
}

interface FinalizeCompanyRequest {
    employerID: string;
    companyRegistrationNumber: string;
    tinNumber: string;
    companyName: string;
    contactPerson: string;
    contactNumber: string;
    contactEmail: string;
    companyAddressLine1: string;
    companyAddressLine2: string;
    companyPlates: PlateFileEntry[];
    companySupportingFiles: SupportingFileEntry;
}

interface FinalizeCompanyResponse {
    id: string;
}

interface UploadResult {
    type: 'electricity' | 'ssm' | 'plate' | 'companyVehicle'; // Added new type
    uid: string;
    originalName: string;
    ossKey?: string;
    error?: Error;
    plateIndex?: number;
    plateNumber?: string;
    vehicleType?: string;
    subType?: 'spa' | 'electricBill' | 'vehicle';
}

// Update PlateFileList type to track three separate files per vehicle
type PlateFileList = Record<number, {
    spaFile?: CustomUploadFile[];
    electricBillFile?: CustomUploadFile[];
    vehicleFile?: CustomUploadFile[];
}>;

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
    const screens = useBreakpoint();
    const [config, setConfig] = useState({
        maxGeneralFiles: 1,
        maxPlateNumbers: 5,
        concurrentUploads: 2,
        maxFileSizeMB: 100,
        allowedTypes: ['image/', 'application/pdf']
    });

    // State for files - updated to track three separate files per vehicle
    const [plateFilesList, setPlateFilesList] = useState<PlateFileList>({});
    const [ssmFileList, setSsmFileList] = useState<CustomUploadFile[]>([]);
    const [electricityBillFileList, setElectricityBillFileList] = useState<CustomUploadFile[]>([]);
    const [companyVehicleFileList, setCompanyVehicleFileList] = useState<CustomUploadFile[]>([]);
    
    // Upload state
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

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
        const fetchConfig = async () => {
            try {
                const response = await axios.get(`${apiBase}/config`);
                setConfig(prevConfig => ({
                    ...prevConfig,
                    ...response.data
                }));
            } catch (error) {
                console.error("Failed to fetch config:", error);
            }
        };
        fetchConfig();
    }, []);

    // --- File Handlers ---
    const handleSpaFileChange = (index: number) => ({ fileList }: { fileList: UploadFile[] }) => {
        setPlateFilesList(prev => ({
            ...prev,
            [index]: {
                ...prev[index],
                spaFile: fileList as CustomUploadFile[]
            }
        }));
    };

    const handleElectricBillFileChange = (index: number) => ({ fileList }: { fileList: UploadFile[] }) => {
        setPlateFilesList(prev => ({
            ...prev,
            [index]: {
                ...prev[index],
                electricBillFile: fileList as CustomUploadFile[]
            }
        }));
    };

    const handleVehicleFileChange = (index: number) => ({ fileList }: { fileList: UploadFile[] }) => {
        setPlateFilesList(prev => ({
            ...prev,
            [index]: {
                ...prev[index],
                vehicleFile: fileList as CustomUploadFile[]
            }
        }));
    };

    const handleSsmFileChange: UploadProps['onChange'] = ({ fileList }) => {
        setSsmFileList(fileList as CustomUploadFile[]);
    };

    const handleCompanyElectricityBillFileChange: UploadProps['onChange'] = ({ fileList }) => {
        setElectricityBillFileList(fileList as CustomUploadFile[]);
    }

    // Add handler for company vehicle file
    const handleCompanyVehicleFileChange: UploadProps['onChange'] = ({ fileList }) => {
        setCompanyVehicleFileList(fileList as CustomUploadFile[]);
    }

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
    const processUploadQueue = async (companyId: string, values: CompanyFormValues): Promise<UploadResult[]> => {
        const uploadTasks: Promise<UploadResult>[] = [];
        const plateNumbers = values.plateNumbers || [];

        // Prepare vehicle document upload tasks (SPA, Electric Bill, Vehicle Document for each vehicle)
        plateNumbers.forEach((plateNumber, index) => {
            if (!plateNumber.plateNumber || plateNumber.plateNumber.trim() === '') return;

            // Upload SPA file for this vehicle
            const spaFiles = plateFilesList[index]?.spaFile || [];
            spaFiles.forEach(file => {
                if (file.originFileObj && file.status !== 'done') {
                    const task = async (): Promise<UploadResult> => {
                        const fileUid = file.uid;
                        const originalName = file.name;

                        try {
                            const validationError = validateFile(file.originFileObj as RcFile);
                            if (validationError) {
                                throw new Error(validationError);
                            }

                            const { data } = await axios.get(`${apiBase}/presigned`, {
                                params: {
                                    registerId: companyId,
                                    fileType: 'plate',
                                    fileName: `spa_${file.name}`,
                                    plateNumber: encodeURIComponent(plateNumber.plateNumber),
                                    contentType: file.type || 'application/octet-stream'
                                }
                            });

                            await putFileToOSS(data.data.url, file.originFileObj as RcFile,
                                (event) => updateProgress(event, fileUid));

                            setPlateFilesList(prev => ({
                                ...prev,
                                [index]: {
                                    ...prev[index],
                                    spaFile: (prev[index]?.spaFile || []).map(f => f.uid === fileUid
                                        ? { ...f, status: 'done', response: { ossKey: data.data.key } }
                                        : f
                                    )
                                }
                            }));

                            return {
                                type: 'plate',
                                uid: fileUid,
                                originalName,
                                ossKey: data.data.key,
                                plateIndex: index,
                                plateNumber: plateNumber.plateNumber,
                                vehicleType: plateNumber.vehicleType,
                                subType: 'spa'
                            };

                        } catch (error) {
                            console.error(`Upload failed for SPA ${originalName}:`, error);
                            
                            setPlateFilesList(prev => ({
                                ...prev,
                                [index]: {
                                    ...prev[index],
                                    spaFile: (prev[index]?.spaFile || []).map(f => f.uid === fileUid
                                        ? { ...f, status: 'error', error: error as Error }
                                        : f
                                    )
                                }
                            }));

                            return {
                                type: 'plate',
                                uid: fileUid,
                                originalName,
                                error: error as Error,
                                plateIndex: index,
                                plateNumber: plateNumber.plateNumber,
                                vehicleType: plateNumber.vehicleType,
                                subType: 'spa'
                            };
                        }
                    };

                    uploadTasks.push(task());
                }
            });

            // Upload Electric Bill file for this vehicle
            const electricBillFiles = plateFilesList[index]?.electricBillFile || [];
            electricBillFiles.forEach(file => {
                if (file.originFileObj && file.status !== 'done') {
                    const task = async (): Promise<UploadResult> => {
                        const fileUid = file.uid;
                        const originalName = file.name;

                        try {
                            const validationError = validateFile(file.originFileObj as RcFile);
                            if (validationError) {
                                throw new Error(validationError);
                            }

                            const { data } = await axios.get(`${apiBase}/presigned`, {
                                params: {
                                    registerId: companyId,
                                    fileType: 'plate',
                                    fileName: `electric_bill_${file.name}`,
                                    plateNumber: encodeURIComponent(plateNumber.plateNumber),
                                    contentType: file.type || 'application/octet-stream'
                                }
                            });

                            await putFileToOSS(data.data.url, file.originFileObj as RcFile,
                                (event) => updateProgress(event, fileUid));

                            setPlateFilesList(prev => ({
                                ...prev,
                                [index]: {
                                    ...prev[index],
                                    electricBillFile: (prev[index]?.electricBillFile || []).map(f => f.uid === fileUid
                                        ? { ...f, status: 'done', response: { ossKey: data.data.key } }
                                        : f
                                    )
                                }
                            }));

                            return {
                                type: 'plate',
                                uid: fileUid,
                                originalName,
                                ossKey: data.data.key,
                                plateIndex: index,
                                plateNumber: plateNumber.plateNumber,
                                vehicleType: plateNumber.vehicleType,
                                subType: 'electricBill'
                            };

                        } catch (error) {
                            console.error(`Upload failed for Electric Bill ${originalName}:`, error);
                            
                            setPlateFilesList(prev => ({
                                ...prev,
                                [index]: {
                                    ...prev[index],
                                    electricBillFile: (prev[index]?.electricBillFile || []).map(f => f.uid === fileUid
                                        ? { ...f, status: 'error', error: error as Error }
                                        : f
                                    )
                                }
                            }));

                            return {
                                type: 'plate',
                                uid: fileUid,
                                originalName,
                                error: error as Error,
                                plateIndex: index,
                                plateNumber: plateNumber.plateNumber,
                                vehicleType: plateNumber.vehicleType,
                                subType: 'electricBill'
                            };
                        }
                    };

                    uploadTasks.push(task());
                }
            });

            // Upload Vehicle Document file for this vehicle
            const vehicleFiles = plateFilesList[index]?.vehicleFile || [];
            vehicleFiles.forEach(file => {
                if (file.originFileObj && file.status !== 'done') {
                    const task = async (): Promise<UploadResult> => {
                        const fileUid = file.uid;
                        const originalName = file.name;

                        try {
                            const validationError = validateFile(file.originFileObj as RcFile);
                            if (validationError) {
                                throw new Error(validationError);
                            }

                            const { data } = await axios.get(`${apiBase}/presigned`, {
                                params: {
                                    registerId: companyId,
                                    fileType: 'plate',
                                    fileName: `vehicle_${file.name}`,
                                    plateNumber: encodeURIComponent(plateNumber.plateNumber),
                                    contentType: file.type || 'application/octet-stream'
                                }
                            });

                            await putFileToOSS(data.data.url, file.originFileObj as RcFile,
                                (event) => updateProgress(event, fileUid));

                            setPlateFilesList(prev => ({
                                ...prev,
                                [index]: {
                                    ...prev[index],
                                    vehicleFile: (prev[index]?.vehicleFile || []).map(f => f.uid === fileUid
                                        ? { ...f, status: 'done', response: { ossKey: data.data.key } }
                                        : f
                                    )
                                }
                            }));

                            return {
                                type: 'plate',
                                uid: fileUid,
                                originalName,
                                ossKey: data.data.key,
                                plateIndex: index,
                                plateNumber: plateNumber.plateNumber,
                                vehicleType: plateNumber.vehicleType,
                                subType: 'vehicle'
                            };

                        } catch (error) {
                            console.error(`Upload failed for Vehicle Document ${originalName}:`, error);
                            
                            setPlateFilesList(prev => ({
                                ...prev,
                                [index]: {
                                    ...prev[index],
                                    vehicleFile: (prev[index]?.vehicleFile || []).map(f => f.uid === fileUid
                                        ? { ...f, status: 'error', error: error as Error }
                                        : f
                                    )
                                }
                            }));

                            return {
                                type: 'plate',
                                uid: fileUid,
                                originalName,
                                error: error as Error,
                                plateIndex: index,
                                plateNumber: plateNumber.plateNumber,
                                vehicleType: plateNumber.vehicleType,
                                subType: 'vehicle'
                            };
                        }
                    };

                    uploadTasks.push(task());
                }
            });
        });

        // Prepare SSM file upload task
        ssmFileList.forEach(file => {
            if (file.originFileObj && file.status !== 'done') {
                const task = async (): Promise<UploadResult> => {
                    const fileUid = file.uid;
                    const originalName = file.name;

                    try {
                        const validationError = validateFile(file.originFileObj as RcFile);
                        if (validationError) {
                            throw new Error(validationError);
                        }

                        const { data } = await axios.get(`${apiBase}/presigned`, {
                            params: {
                                registerId: companyId,
                                fileType: 'general',
                                fileName: file.name,
                                contentType: file.type || 'application/octet-stream'
                            }
                        });

                        await putFileToOSS(data.data.url, file.originFileObj as RcFile, 
                            (event) => updateProgress(event, fileUid));

                        setSsmFileList(prev => 
                            prev.map(f => f.uid === fileUid 
                                ? { ...f, status: 'done', response: { ossKey: data.data.key } }
                                : f
                            )
                        );

                        return {
                            type: 'ssm',
                            uid: fileUid,
                            originalName,
                            ossKey: data.data.key
                        };

                    } catch (error) {
                        console.error(`Upload failed for ${originalName}:`, error);
                        
                        setSsmFileList(prev => 
                            prev.map(f => f.uid === fileUid 
                                ? { ...f, status: 'error', error: error as Error }
                                : f
                            )
                        );

                        return {
                            type: 'ssm',
                            uid: fileUid,
                            originalName,
                            error: error as Error
                        };
                    }
                };

                uploadTasks.push(task());
            }
        });

        // Prepare company electricity bill file upload task
        electricityBillFileList.forEach((file, index) => {
            if (file.originFileObj && file.status !== 'done') {
                const task = async (): Promise<UploadResult> => {
                    const fileUid = file.uid;
                    const originalName = file.name;

                    try {
                        const validationError = validateFile(file.originFileObj as RcFile);
                        if (validationError) {
                            throw new Error(validationError);
                        }

                        const { data } = await axios.get(`${apiBase}/presigned`, {
                            params: {
                                registerId: companyId,
                                fileType: 'general',
                                fileName: file.name,
                                contentType: file.type || 'application/octet-stream'
                            }
                        });

                        await putFileToOSS(data.data.url, file.originFileObj as RcFile, 
                            (event) => updateProgress(event, fileUid));

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

        // Prepare company vehicle file upload task (for SupportingFileEntry.vehiclePath)
        companyVehicleFileList.forEach((file, index) => {
            if (file.originFileObj && file.status !== 'done') {
                const task = async (): Promise<UploadResult> => {
                    const fileUid = file.uid;
                    const originalName = file.name;

                    try {
                        const validationError = validateFile(file.originFileObj as RcFile);
                        if (validationError) {
                            throw new Error(validationError);
                        }

                        const { data } = await axios.get(`${apiBase}/presigned`, {
                            params: {
                                registerId: companyId,
                                fileType: 'general',
                                fileName: file.name,
                                contentType: file.type || 'application/octet-stream'
                            }
                        });

                        await putFileToOSS(data.data.url, file.originFileObj as RcFile, 
                            (event) => updateProgress(event, fileUid));

                        setCompanyVehicleFileList(prev => 
                            prev.map(f => f.uid === fileUid 
                                ? { ...f, status: 'done', response: { ossKey: data.data.key } }
                                : f
                            )
                        );

                        return {
                            type: 'companyVehicle', // New type for company vehicle file
                            uid: fileUid,
                            originalName,
                            ossKey: data.data.key
                        };

                    } catch (error) {
                        console.error(`Upload failed for company vehicle document ${originalName}:`, error);
                        
                        setCompanyVehicleFileList(prev => 
                            prev.map(f => f.uid === fileUid 
                                ? { ...f, status: 'error', error: error as Error }
                                : f
                            )
                        );

                        return {
                            type: 'companyVehicle',
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

    // --- Form Submission ---
    const onFinish = async (values: CompanyFormValues) => {
        if (!turnstileToken) {
            message.error('Please complete the security verification.');
            return;
        }

        const currentPlateNumbers = values.plateNumbers?.filter(p => p && p.plateNumber.trim() !== '') || [];
        
        // Enhanced validation for all three documents per vehicle
        let hasAllVehicleDocs = true;
        currentPlateNumbers.forEach((_, index) => {
            const hasSpa = (plateFilesList[index]?.spaFile || []).length > 0;
            const hasElectricBill = (plateFilesList[index]?.electricBillFile || []).length > 0;
            const hasVehicleDoc = (plateFilesList[index]?.vehicleFile || []).length > 0;
            
            if (!hasSpa || !hasElectricBill || !hasVehicleDoc) {
                hasAllVehicleDocs = false;
                message.error(`Please attach all three documents for Vehicle #${index + 1} (SPA, Electric Bill, Vehicle Document)`);
            }
        });

        if (!hasAllVehicleDocs) {
            return;
        }

        const hasSsmFile = ssmFileList.length > 0;
        const hasCompanyElectricityBill = electricityBillFileList.length > 0;
        const hasCompanyVehicleFile = companyVehicleFileList.length > 0; // Add validation for company vehicle file

        if (!hasSsmFile) {
            message.error('Please attach SSM document.');
            return;
        }

        if (!hasCompanyElectricityBill) {
            message.error('Please attach Company Electricity Bill.');
            return;
        }

        if (!hasCompanyVehicleFile) {
            message.error('Please attach Company Vehicle Document.');
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

            const companyId = createResponse.data.data.employerID;
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

            if (successfulUploads.length !== results.length) {
                throw new Error('Not all files were successfully uploaded.');
            }

            message.success(`All ${successfulUploads.length} files uploaded successfully!`);

            // Step 3: Prepare finalization data
            const companyPlates: PlateFileEntry[] = [];
            const companySupportingFiles: SupportingFileEntry = {
                ssmPath: '',
                electricBillPath: '',
                vehiclePath: ''
            };

            // Group uploads by plate to collect all three document paths per vehicle
            const plateUploads: Record<string, { 
                plateNumber: string; 
                vehicleType: string; 
                spaPath?: string; 
                electricBillPath?: string; 
                vehiclePath?: string; 
            }> = {};

            successfulUploads.forEach(result => {
                if (result.type === 'ssm' && result.ossKey) {
                    companySupportingFiles.ssmPath = result.ossKey;
                } else if (result.type === 'electricity' && result.ossKey) {
                    companySupportingFiles.electricBillPath = result.ossKey;
                } else if (result.type === 'companyVehicle' && result.ossKey) {
                    companySupportingFiles.vehiclePath = result.ossKey;
                } else if (result.type === 'plate' && result.ossKey && result.plateNumber && result.vehicleType) {
                    const plateKey = `${result.plateNumber}-${result.plateIndex}`;
                    
                    if (!plateUploads[plateKey]) {
                        plateUploads[plateKey] = {
                            plateNumber: result.plateNumber,
                            vehicleType: result.vehicleType || '',
                            spaPath: '',
                            electricBillPath: '',
                            vehiclePath: ''
                        };
                    }
                    
                    // Assign the OSS key to the correct field based on subType
                    if (result.subType === 'spa') {
                        plateUploads[plateKey].spaPath = result.ossKey;
                    } else if (result.subType === 'electricBill') {
                        plateUploads[plateKey].electricBillPath = result.ossKey;
                    } else if (result.subType === 'vehicle') {
                        plateUploads[plateKey].vehiclePath = result.ossKey;
                    }
                }
            });

            // Convert grouped uploads to companyPlates array
            Object.values(plateUploads).forEach(plateData => {
                companyPlates.push({
                    nricNumber: '',
                    plateNumber: plateData.plateNumber,
                    vehicleType: plateData.vehicleType,
                    spaPath: plateData.spaPath || '',
                    electricBillPath: plateData.electricBillPath || '',
                    vehiclePath: plateData.vehiclePath || ''
                });
            });

            // Step 4: Finalize Company
            message.loading('Finalizing company registration...', 0);
            const finalizeResponse = await axios.post<FinalizeCompanyResponse>(
                `${apiBase}/registers/company/finalize`,
                {
                    employerID: companyId,
                    companyRegistrationNumber: values.companyRegistrationNumber,
                    tinNumber: values.taxIdentificationNumber,
                    companyName: values.companyName,
                    contactPerson: values.contactPerson,
                    contactNumber: values.contactNumber,
                    contactEmail: values.contactEmail,
                    companyAddressLine1: values.companyAddressLine1,
                    companyAddressLine2: values.companyAddressLine2 || '',
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
            setSsmFileList([]);
            setElectricityBillFileList([]);
            setCompanyVehicleFileList([]); // Reset company vehicle file list
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
                                <Text>
                                    {result.originalName}
                                    {result.plateNumber && (
                                        <Tag color="blue" style={{ marginLeft: 8 }}>
                                            Plate: {result.plateNumber}
                                            {result.subType && ` (${result.subType})`}
                                        </Tag>
                                    )}
                                    {result.type === 'companyVehicle' && (
                                        <Tag color="purple" style={{ marginLeft: 8 }}>Company Vehicle</Tag>
                                    )}
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
                            <Row gutter={responsiveConfig.layout.gutter}>
                                <Col xs={24} md={12}>
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
                                <Col xs={24} md={12}>
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

                            <Row gutter={responsiveConfig.layout.gutter}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="companyName"
                                        label="Company Name"
                                        rules={[{ required: true, message: 'Required' }]}
                                    >
                                        <Input placeholder="Enter Company Name" size="large" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="contactPerson"
                                        label="Contact Person"
                                        rules={[{ required: true, message: 'Required' }]}
                                    >
                                        <Input placeholder="Enter Contact Person" size="large" />
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
                                        <Input placeholder="Enter Contact Number" size="large" />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        name="contactEmail"
                                        label="Email Address"
                                        rules={[{ required: true, message: 'Required' }]}
                                    >
                                        <Input placeholder="Enter Email Address" size="large" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={responsiveConfig.layout.gutter}>
                                <Col xs={24} md={12}>
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
                                </Col>
                                <Col xs={24} md={12}>
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
                                </Col>
                            </Row>

                            <Divider style={{ margin: '24px 0' }}>
                                Staff Vehicle Information
                            </Divider>

                            {/* Dynamic Plate List with Three Document Uploads per Vehicle */}
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
                                                            setPlateFilesList(prev => {
                                                                const copy = { ...prev };
                                                                delete copy[index];
                                                                return copy;
                                                            });
                                                        }}
                                                    />
                                                ) : null}
                                            >
                                                <Row gutter={responsiveConfig.layout.gutter}>
                                                    <Col xs={24} md={6}>
                                                        <Form.Item
                                                            {...restField}
                                                            name={[name, 'plateNumber']}
                                                            rules={[{ required: true, message: 'Required' }]}
                                                            style={{ marginBottom: 0 }}
                                                        >
                                                            <Input 
                                                                placeholder="Enter Plate Number" 
                                                                size="large" 
                                                            />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col xs={24} md={6}>
                                                        <Form.Item
                                                            {...restField}
                                                            name={[name, 'vehicleType']}
                                                            rules={[{ required: true, message: 'Required' }]}
                                                            style={{ marginBottom: 0 }}
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
                                                    <Col xs={24} md={4}>
                                                        <Upload
                                                            fileList={plateFilesList[index]?.spaFile || []}
                                                            onChange={handleSpaFileChange(index)}
                                                            beforeUpload={() => false}
                                                            customRequest={dummyRequest}
                                                            maxCount={1}
                                                            disabled={uploading}
                                                        >
                                                            <Button 
                                                                size="large" 
                                                                icon={<UploadOutlined />}
                                                                disabled={uploading}
                                                                style={{ width: '100%' }}
                                                            >
                                                                SPA
                                                            </Button>
                                                        </Upload>
                                                    </Col>
                                                    <Col xs={24} md={4}>
                                                        <Upload
                                                            fileList={plateFilesList[index]?.electricBillFile || []}
                                                            onChange={handleElectricBillFileChange(index)}
                                                            beforeUpload={() => false}
                                                            customRequest={dummyRequest}
                                                            maxCount={1}
                                                            disabled={uploading}
                                                        >
                                                            <Button 
                                                                size="large" 
                                                                icon={<UploadOutlined />}
                                                                disabled={uploading}
                                                                style={{ width: '100%' }}
                                                            >
                                                                Electric Bill
                                                            </Button>
                                                        </Upload>
                                                    </Col>
                                                    <Col xs={24} md={4}>
                                                        <Upload
                                                            fileList={plateFilesList[index]?.vehicleFile || []}
                                                            onChange={handleVehicleFileChange(index)}
                                                            beforeUpload={() => false}
                                                            customRequest={dummyRequest}
                                                            maxCount={1}
                                                            disabled={uploading}
                                                        >
                                                            <Button 
                                                                size="large" 
                                                                icon={<UploadOutlined />}
                                                                disabled={uploading}
                                                                style={{ width: '100%' }}
                                                            >
                                                                Vehicle Doc
                                                            </Button>
                                                        </Upload>
                                                    </Col>
                                                </Row>

                                                {/* Progress indicators for each file type */}
                                                {uploading && (
                                                    <>
                                                        {(plateFilesList[index]?.spaFile || []).map(file => (
                                                            uploadProgress[file.uid] !== undefined && (
                                                                <div key={`spa-${file.uid}`} style={{ marginTop: 8 }}>
                                                                    <Text>SPA: {file.name}</Text>
                                                                    <Progress
                                                                        percent={uploadProgress[file.uid]}
                                                                        size="small"
                                                                        status={file.status === 'error' ? 'exception' : 'active'}
                                                                    />
                                                                </div>
                                                            )
                                                        ))}
                                                        {(plateFilesList[index]?.electricBillFile || []).map(file => (
                                                            uploadProgress[file.uid] !== undefined && (
                                                                <div key={`electric-${file.uid}`} style={{ marginTop: 8 }}>
                                                                    <Text>Electric Bill: {file.name}</Text>
                                                                    <Progress
                                                                        percent={uploadProgress[file.uid]}
                                                                        size="small"
                                                                        status={file.status === 'error' ? 'exception' : 'active'}
                                                                    />
                                                                </div>
                                                            )
                                                        ))}
                                                        {(plateFilesList[index]?.vehicleFile || []).map(file => (
                                                            uploadProgress[file.uid] !== undefined && (
                                                                <div key={`vehicle-${file.uid}`} style={{ marginTop: 8 }}>
                                                                    <Text>Vehicle Doc: {file.name}</Text>
                                                                    <Progress
                                                                        percent={uploadProgress[file.uid]}
                                                                        size="small"
                                                                        status={file.status === 'error' ? 'exception' : 'active'}
                                                                    />
                                                                </div>
                                                            )
                                                        ))}
                                                    </>
                                                )}
                                            </Card>
                                        ))}

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

                            <Divider style={{ margin: '24px 0' }}>
                                Supporting Documents
                            </Divider>

                            {/* SSM Files Upload */}
                            <Form.Item
                                label="SSM Document"
                                extra={`Upload SSM files. Allowed: PDF, JPG, PNG. Max size: ${config.maxFileSizeMB}MB`}
                            >
                                <Dragger
                                    name="ssmFile"
                                    maxCount={config.maxGeneralFiles}
                                    fileList={ssmFileList}
                                    onChange={handleSsmFileChange}
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
                                        Click or drag SSM file to this area
                                    </p>
                                </Dragger>

                                {/* Progress for SSM files */}
                                {uploading && ssmFileList.map(file => (
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

                            {/* Company Electricity Bills Upload */}
                            <Form.Item
                                label="Company Electricity Bills"
                                extra={`Upload Company Electricity Bill. Allowed: PDF, JPG, PNG. Max size: ${config.maxFileSizeMB}MB`}  
                            >
                                <Dragger
                                    name="electricityFiles"
                                    maxCount={config.maxGeneralFiles}
                                    fileList={electricityBillFileList}
                                    onChange={handleCompanyElectricityBillFileChange}
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
                                        Click or drag company electricity bill files to this area   
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

                            {/* Company Vehicle Document Upload - NEW SECTION */}
                            <Form.Item
                                label="Company Vehicle Document"
                                extra={`Upload Company Vehicle Document (for SupportingFileEntry.vehiclePath). Allowed: PDF, JPG, PNG. Max size: ${config.maxFileSizeMB}MB`}  
                            >
                                <Dragger
                                    name="companyVehicleFile"
                                    maxCount={config.maxGeneralFiles}
                                    fileList={companyVehicleFileList}
                                    onChange={handleCompanyVehicleFileChange}
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
                                        Click or drag company vehicle document to this area
                                    </p>
                                </Dragger>

                                {/* Progress for Company Vehicle files */}
                                {uploading && companyVehicleFileList.map(file => (
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
                </div>
            </Content>
        </Layout>
    );
}