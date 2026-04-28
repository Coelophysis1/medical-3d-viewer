'use client';

import { useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';

interface QRCodeProps {
  url: string;
  size?: number;
  logoSize?: number;
}

const qrCodeConfig = {
  width: 200,
  height: 200,
  type: 'svg' as const,
  data: '',
  dotsOptions: {
    color: '#1e40af', // 深蓝色，与 Logo 配色呼应
    type: 'rounded' as const,
  },
  cornersSquareOptions: {
    color: '#1e40af',
    type: 'extra-rounded' as const,
  },
  cornersDotOptions: {
    color: '#1e40af',
    type: 'dot' as const,
  },
  backgroundOptions: {
    color: '#ffffff',
  },
  imageOptions: {
    crossOrigin: 'anonymous',
    margin: 8,
    imageSize: 0.3, // Logo 占二维码的 30%
  },
};

export default function QRCode({ url, size = 200, logoSize = 0.3 }: QRCodeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    if (!ref.current || !url) return;

    // 初始化二维码
    if (!qrCodeRef.current) {
      qrCodeRef.current = new QRCodeStyling({
        ...qrCodeConfig,
        width: size,
        height: size,
        data: url,
        imageOptions: {
          ...qrCodeConfig.imageOptions,
          imageSize: logoSize,
        },
        image: '/logo.png',
      });
      qrCodeRef.current.append(ref.current);
    } else {
      // 更新二维码
      qrCodeRef.current.update({
        data: url,
        width: size,
        height: size,
        imageOptions: {
          ...qrCodeConfig.imageOptions,
          imageSize: logoSize,
        },
      });
    }
  }, [url, size, logoSize]);

  return <div ref={ref} className="flex items-center justify-center" />;
}
