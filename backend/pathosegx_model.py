"""Inference architecture from PathoSegX-BR/src/models.py; parameter names preserved."""

import torch
from torch import nn
from torch.nn import functional as F


class DoubleConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.double_conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.double_conv(x)


class DecoderBlock(nn.Module):
    def __init__(self, in_channels, skip_channels, out_channels):
        super().__init__()
        self.up = nn.ConvTranspose2d(in_channels, in_channels // 2, 2, stride=2)
        self.conv = DoubleConv(in_channels // 2 + skip_channels, out_channels)

    def forward(self, x, skip):
        x = self.up(x)
        diff_y = skip.size(2) - x.size(2)
        diff_x = skip.size(3) - x.size(3)
        if diff_y > 0 or diff_x > 0:
            x = F.pad(x, [diff_x // 2, diff_x - diff_x // 2,
                          diff_y // 2, diff_y - diff_y // 2])
        return self.conv(torch.cat([skip, x], dim=1))


class ResNet50UNet(nn.Module):
    def __init__(self, num_classes):
        super().__init__()
        from torchvision.models import resnet50

        self.num_classes = num_classes
        # The checkpoint supplies all weights; no pretrained download is needed.
        resnet = resnet50(weights=None)
        self.initial = nn.Sequential(resnet.conv1, resnet.bn1, resnet.relu)
        self.maxpool = resnet.maxpool
        self.layer1 = resnet.layer1
        self.layer2 = resnet.layer2
        self.layer3 = resnet.layer3
        self.layer4 = resnet.layer4
        self.dec4 = DecoderBlock(2048, 1024, 512)
        self.dec3 = DecoderBlock(512, 512, 256)
        self.dec2 = DecoderBlock(256, 256, 128)
        self.dec1 = DecoderBlock(128, 64, 64)
        self.final_up = nn.ConvTranspose2d(64, 32, 2, stride=2)
        self.final_conv = nn.Sequential(DoubleConv(32, 32), nn.Conv2d(32, num_classes, 1))

    def forward(self, x):
        e0 = self.initial(x)
        e1 = self.layer1(self.maxpool(e0))
        e2 = self.layer2(e1)
        e3 = self.layer3(e2)
        e4 = self.layer4(e3)
        d4 = self.dec4(e4, e3)
        d3 = self.dec3(d4, e2)
        d2 = self.dec2(d3, e1)
        d1 = self.dec1(d2, e0)
        return self.final_conv(self.final_up(d1))
