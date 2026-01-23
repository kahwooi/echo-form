// src/components/InfoModal.tsx
import { Modal, Image } from 'antd';
import { type ReactNode } from 'react';

interface InfoModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    content?: ReactNode;
    image?: string;
    imageAlt?: string;
}

export const InfoModal = ({ open, onClose, title, content, image, imageAlt }: InfoModalProps) => (
    <Modal
        title={title}
        open={open}
        onCancel={onClose}
        footer={null}
        width={500}
    >
        {image && (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Image src={image} alt={imageAlt} style={{ maxWidth: '100%' }} />
            </div>
        )}
        {content}
    </Modal>
);
