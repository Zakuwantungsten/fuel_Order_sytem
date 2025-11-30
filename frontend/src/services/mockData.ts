import { DeliveryOrder, LPOEntry, FuelRecord, DashboardStats, User } from '../types';

// Mock Delivery Orders
const mockDeliveryOrders: DeliveryOrder[] = [
  {
    id: 1,
    sn: 6343,
    date: '3-Oct',
    importOrExport: 'IMPORT',
    doType: 'DO',
    doNumber: '6343',
    clientName: 'POSEIDON',
    truckNo: 'T844 EKS',
    trailerNo: 'T629 ELE',
    containerNo: 'LOOSE CARGO',
    loadingPoint: 'DAR',
    destination: 'CCR KOLWEZI',
    haulier: '',
    tonnages: 32,
    ratePerTon: 180,
  },
  {
    id: 2,
    sn: 6353,
    date: '3-Oct',
    importOrExport: 'EXPORT',
    doType: 'DO',
    doNumber: '6353',
    clientName: 'POSEIDON',
    truckNo: 'T854 EKS',
    trailerNo: 'T905 EKY',
    containerNo: 'LOOSE CARGO',
    loadingPoint: 'TENKEFUNGURUME',
    destination: 'DAR',
    haulier: 'TFM',
    tonnages: 32,
    ratePerTon: 180,
  },
  {
    id: 3,
    sn: 6378,
    date: '6-Oct',
    importOrExport: 'EXPORT',
    doType: 'DO',
    doNumber: '6378',
    clientName: 'POLYTRA',
    truckNo: 'T156 EGJ',
    trailerNo: 'T225 EFU',
    containerNo: 'LOOSE CARGO',
    loadingPoint: 'KAMOA',
    destination: 'DAR',
    haulier: 'KAMOA',
    tonnages: 32,
    ratePerTon: 170,
  },
];

// Mock LPO Entries
const mockLPOEntries: LPOEntry[] = [
  {
    id: 1,
    sn: 1,
    date: '1-Nov',
    lpoNo: '2150',
    dieselAt: 'LAKE CHILABOMBWE',
    doSdo: '6376',
    truckNo: 'T530 DRF',
    ltrs: 40,
    pricePerLtr: 1.2,
    destinations: 'Dar',
  },
  {
    id: 2,
    sn: 2,
    date: '1-Nov',
    lpoNo: '2151',
    dieselAt: 'LAKE CHILABOMBWE',
    doSdo: '6530',
    truckNo: 'T148 EGJ',
    ltrs: 40,
    pricePerLtr: 1.2,
    destinations: 'Dar',
  },
  {
    id: 3,
    sn: 8,
    date: '3-Nov',
    lpoNo: '2154',
    dieselAt: 'LAKE NDOLA',
    doSdo: '6415',
    truckNo: 'T546 EKT',
    ltrs: 50,
    pricePerLtr: 1.2,
    destinations: 'DAR',
  },
];

// Mock Fuel Records - October 2024
const mockFuelRecords: FuelRecord[] = [
  // October 6 records
  { id: 1, date: '6-Oct', truckNo: 'T705 DXY', goingDo: '6395', start: 'DAR', from: 'DAR', to: 'Kpm', totalLts: 2200, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -400, balance: 900 },
  { id: 2, date: '6-Oct', truckNo: 'T572 EAF', goingDo: '6396', start: 'DAR', from: 'DAR', to: 'Kpm', totalLts: 2200, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -400, balance: 900 },
  { id: 3, date: '6-Oct', truckNo: 'T510 EGD', goingDo: '6397', start: 'DAR', from: 'DAR', to: 'Kpm', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 4, date: '6-Oct', truckNo: 'T552 DRE', goingDo: '6398', start: 'DAR', from: 'DAR', to: 'Kpm', totalLts: 2200, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -400, balance: 900 },
  { id: 5, date: '6-Oct', truckNo: 'T839 EKS', goingDo: '6399', start: 'DAR', from: 'DAR', to: 'Kpm', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 6, date: '6-Oct', truckNo: 'T583 DPN', goingDo: '6400', start: 'DAR', from: 'DAR', to: 'Kpm', totalLts: 2200, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 700 },
  { id: 7, date: '6-Oct', truckNo: 'T862 EKS', goingDo: '6401', start: 'DAR', from: 'DAR', to: 'Kpm', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 8, date: '6-Oct', truckNo: 'T148 DZY', goingDo: '6402', start: 'DAR', from: 'DAR', to: 'Kpm', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 9, date: '6-Oct', truckNo: 'T531 EGD', goingDo: '6403', start: 'DAR', from: 'DAR', to: 'Kpm', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 10, date: '6-Oct', truckNo: 'T551 EKT', goingDo: '6404', start: 'DAR', from: 'DAR', to: 'Kpm', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 11, date: '6-Oct', truckNo: 'T664 ECQ', goingDo: '6449', returnDo: '6868', start: 'DAR', from: 'COMIKA', to: 'DAR', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, balance: 1260 },
  { id: 12, date: '6-Oct', truckNo: 'T784 DWK', goingDo: '6450', start: 'DAR', from: 'DAR', to: 'Likasi', totalLts: 2200, extra: 80, darYard: -550, mbeyaGoing: -450, tdmGoing: -380, balance: 900 },
  { id: 13, date: '6-Oct', truckNo: 'T857 DNH', goingDo: '6451', start: 'DAR', from: 'DAR', to: 'Likasi', totalLts: 2200, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -400, balance: 900 },
  { id: 14, date: '6-Oct', truckNo: 'T753 ELY', goingDo: '6452', start: 'DAR', from: 'DAR', to: 'Likasi', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 15, date: '6-Oct', truckNo: 'T668 ECQ', goingDo: '6453', returnDo: '6865', start: 'DAR', from: 'COMIKA', to: 'DAR', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 16, date: '6-Oct', truckNo: 'T405 EAF', goingDo: '6454', returnDo: '6870', start: 'DAR', from: 'COMIKA', to: 'DAR', totalLts: 2200, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -400, balance: 900 },
  { id: 17, date: '6-Oct', truckNo: 'T643 EAF', goingDo: '6455', returnDo: '6869', start: 'DAR', from: 'COMIKA', to: 'DAR', totalLts: 2200, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -400, balance: 900 },
  { id: 18, date: '6-Oct', truckNo: 'T511 EGD', goingDo: '6456', returnDo: '6866', start: 'DAR', from: 'COMIKA', to: 'DAR', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 19, date: '6-Oct', truckNo: 'T766 DWK', goingDo: '6457', start: 'DAR', from: 'DAR', to: 'Likasi', totalLts: 2200, extra: 80, darYard: -550, mbeyaGoing: -450, tdmGoing: -380, balance: 900 },
  { id: 20, date: '6-Oct', truckNo: 'T574 EAF', goingDo: '6458', returnDo: '6867', start: 'DAR', from: 'COMIKA', to: 'DAR', totalLts: 2200, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -400, balance: 900 },
  { id: 21, date: '6-Oct', truckNo: 'T641 EAF', goingDo: '6459', returnDo: '6845', start: 'DAR', from: 'ZHANFEI', to: 'DAR', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 900 },
  { id: 22, date: '6-Oct', truckNo: 'T881 EEU', goingDo: '6460', returnDo: '6841', start: 'DAR', from: 'ZHANFEI', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, zambiaGoing: -400, balance: 500 },
  { id: 23, date: '6-Oct', truckNo: 'T146 EFP', goingDo: '6461', returnDo: '6838', start: 'DAR', from: 'ZHANFEI', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, zambiaGoing: -400, congoFuel: -100, zambiaReturn: -400, balance: 0 },
  { id: 24, date: '6-Oct', truckNo: 'T524 EEQ', goingDo: '6462', returnDo: '6849', start: 'DAR', from: 'TCC', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 25, date: '6-Oct', truckNo: 'T714 DXY', goingDo: '6463', returnDo: '6871', start: 'DAR', from: 'KAMOA', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, balance: 1460 },
  { id: 26, date: '6-Oct', truckNo: 'T699 EHJ', goingDo: '6464', returnDo: '6850', start: 'DAR', from: 'TCC', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 27, date: '6-Oct', truckNo: 'T707 DXY', goingDo: '6465', returnDo: '6837', start: 'DAR', from: 'ZHANFEI', to: 'DAR', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, zambiaGoing: -400, congoFuel: -100, zambiaReturn: -400, balance: 0 },
  { id: 28, date: '6-Oct', truckNo: 'T760 DNH', goingDo: '6466', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 900 },
  { id: 29, date: '6-Oct', truckNo: 'T709 EHJ', goingDo: '6467', returnDo: '6842', start: 'DAR', from: 'ZHANFEI', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, zambiaGoing: -400, balance: 500 },
  { id: 30, date: '6-Oct', truckNo: 'T212 ELV', goingDo: '6468', returnDo: '6839', start: 'DAR', from: 'ZHANFEI', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  
  // October 16 records
  { id: 65, date: '16-Oct', truckNo: 'T709 DXY', goingDo: '6547', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 100, darGoing: -120, darYard: -380, darReturn: -500, tdmGoing: -600, balance: 900 },
  { id: 66, date: '16-Oct', truckNo: 'T750 ELY', goingDo: '6548', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 67, date: '16-Oct', truckNo: 'T634 DNY', goingDo: '6549', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 900 },
  { id: 68, date: '16-Oct', truckNo: 'T715 DXY', goingDo: '6550', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 900 },
  { id: 69, date: '16-Oct', truckNo: 'T713 EET', goingDo: '6551', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 70, date: '16-Oct', truckNo: 'T204 EHE', goingDo: '6552', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 71, date: '16-Oct', truckNo: 'T408 EAF', goingDo: '6553', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 900 },
  { id: 72, date: '16-Oct', truckNo: 'T166 EGJ', goingDo: '6554', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 73, date: '16-Oct', truckNo: 'T510 EEQ', goingDo: '6555', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 74, date: '16-Oct', truckNo: 'T102 EFP', goingDo: '6556', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 75, date: '16-Oct', truckNo: 'T144 DZY', goingDo: '6557', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 76, date: '16-Oct', truckNo: 'T891 EEU', goingDo: '6558', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 77, date: '16-Oct', truckNo: 'T665 ECQ', goingDo: '6559', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 78, date: '16-Oct', truckNo: 'T154 EGJ', goingDo: '6560', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 79, date: '16-Oct', truckNo: 'T714 EHJ', goingDo: '6561', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 80, date: '16-Oct', truckNo: 'T667 ECQ', goingDo: '6562', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 81, date: '16-Oct', truckNo: 'T586 DRE', goingDo: '6563', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 900 },
  { id: 82, date: '16-Oct', truckNo: 'T885 EEU', goingDo: '6564', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 83, date: '16-Oct', truckNo: 'T214 ELV', goingDo: '6565', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 84, date: '16-Oct', truckNo: 'T536 EEQ', goingDo: '6566', start: 'DAR', from: 'DAR', to: 'KOLWEZI', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  
  // October 21 records
  { id: 100, date: '21-Oct', truckNo: 'T596 EDD', goingDo: '6589', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 30, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 870 },
  { id: 101, date: '21-Oct', truckNo: 'T661 ECQ', goingDo: '6590', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 50, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 890 },
  { id: 102, date: '21-Oct', truckNo: 'T455 EAG', goingDo: '6591', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 30, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 870 },
  { id: 103, date: '21-Oct', truckNo: 'T671 ECQ', goingDo: '6592', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 30, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 870 },
  { id: 104, date: '21-Oct', truckNo: 'T834 DYX', goingDo: '6593', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 30, balance: 1930 },
  { id: 105, date: '21-Oct', truckNo: 'T670 ECQ', goingDo: '6594', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 30, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 870 },
  { id: 106, date: '21-Oct', truckNo: 'T640 EAF', goingDo: '6595', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 50, balance: 1950 },
  { id: 107, date: '21-Oct', truckNo: 'T522 DRF', goingDo: '6596', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 50, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 890 },
  { id: 108, date: '21-Oct', truckNo: 'T597 DTB', goingDo: '6597', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 50, darYard: -550, mbeyaGoing: -450, zambiaGoing: -130, balance: 820 },
  { id: 109, date: '21-Oct', truckNo: 'T653 EAR', goingDo: '6598', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 50, balance: 1950 },
  { id: 110, date: '21-Oct', truckNo: 'T758 ELY', goingDo: '6599', start: 'DAR', from: 'DAR', to: 'Lubumbashi', totalLts: 2100, extra: 60, congoFuel: -260, balance: 1900 },
  { id: 111, date: '21-Oct', truckNo: 'T513 EGD', goingDo: '6600', start: 'DAR', from: 'DAR', to: 'Lubumbashi', totalLts: 2100, extra: 60, darYard: -550, mbeyaGoing: -450, congoFuel: -260, balance: 900 },
  { id: 112, date: '21-Oct', truckNo: 'T970 DNW', goingDo: '6601', start: 'DAR', from: 'DAR', to: 'Lubumbashi', totalLts: 2100, extra: 100, darYard: -550, mbeyaGoing: -450, congoFuel: -300, balance: 900 },
  
  // October 27 records
  { id: 113, date: '27-Oct', truckNo: 'T836 EKS', goingDo: '6686', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 114, date: '27-Oct', truckNo: 'T751 ELY', goingDo: '6687', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 115, date: '27-Oct', truckNo: 'T633 EAF', goingDo: '6688', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -500, balance: 900 },
  { id: 116, date: '27-Oct', truckNo: 'T159 EGJ', goingDo: '6690', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 117, date: '27-Oct', truckNo: 'T839 DNH', goingDo: '6689', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -500, balance: 900 },
  { id: 118, date: '27-Oct', truckNo: 'T605 EDD', goingDo: '6691', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 119, date: '27-Oct', truckNo: 'T147 DZY', goingDo: '6692', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 120, date: '27-Oct', truckNo: 'T854 EKS', goingDo: '6693', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 121, date: '27-Oct', truckNo: 'T458 EAG', goingDo: '6694', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, balance: 1360 },
  { id: 122, date: '27-Oct', truckNo: 'T125 DYY', goingDo: '6695', returnDo: '6864', start: 'DAR', from: 'TCC', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 123, date: '27-Oct', truckNo: 'T700 DXY', goingDo: '6696', start: 'DAR', from: 'DAR', to: 'Commus', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 900 },
  { id: 124, date: '27-Oct', truckNo: 'T242 ELV', goingDo: '6697', start: 'DAR', from: 'DAR', to: 'Commus', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 125, date: '27-Oct', truckNo: 'T702 DXY', goingDo: '6698', start: 'DAR', from: 'DAR', to: 'Commus', totalLts: 2400, extra: 100, darGoing: -85, balance: 2415 },
  { id: 126, date: '27-Oct', truckNo: 'T240 ELV', goingDo: '6699', start: 'DAR', from: 'DAR', to: 'Commus', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, balance: 1460 },
  { id: 127, date: '27-Oct', truckNo: 'T243 ELV', goingDo: '6700', start: 'DAR', from: 'DAR', to: 'Commus', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  
  // October 29-30 records
  { id: 136, date: '29-Oct', truckNo: 'T720 EET', goingDo: '6711', start: 'MBSA', from: 'MBSA', to: 'Lubumbashi', totalLts: 1900, extra: 60, tangaYard: -450, moroGoing: -470, congoFuel: -260, balance: 780 },
  { id: 137, date: '30-Oct', truckNo: 'T712 DXY', goingDo: '6712', start: 'MBSA', from: 'MBSA', to: 'Lubumbashi', totalLts: 1900, extra: 100, tangaYard: -450, moroGoing: -470, congoFuel: -300, balance: 780 },
  
  // November records
  { id: 138, date: '1-Nov', truckNo: 'T530 DRF', goingDo: '6376', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 900 },
  { id: 139, date: '1-Nov', truckNo: 'T148 EGJ', goingDo: '6530', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 140, date: '1-Nov', truckNo: 'T725 EHJ', goingDo: '6720', start: 'DAR', from: 'DAR', to: 'Kamoa', totalLts: 2200, extra: 80, darYard: -550, mbeyaGoing: -450, tdmGoing: -380, balance: 900 },
  { id: 141, date: '2-Nov', truckNo: 'T890 EEU', goingDo: '6721', returnDo: '6900', start: 'DAR', from: 'COMIKA', to: 'DAR', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 142, date: '2-Nov', truckNo: 'T512 EGD', goingDo: '6722', start: 'DAR', from: 'DAR', to: 'Lubumbashi', totalLts: 2100, extra: 100, darYard: -550, mbeyaGoing: -450, congoFuel: -300, balance: 900 },
  { id: 143, date: '3-Nov', truckNo: 'T546 EKT', goingDo: '6415', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 50, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 890 },
  { id: 144, date: '3-Nov', truckNo: 'T841 EKS', goingDo: '6723', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 145, date: '3-Nov', truckNo: 'T156 EGJ', goingDo: '6724', returnDo: '6901', start: 'DAR', from: 'ZHANFEI', to: 'DAR', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, zambiaGoing: -400, congoFuel: -100, zambiaReturn: -400, balance: 0 },
  { id: 146, date: '4-Nov', truckNo: 'T650 EAR', goingDo: '6725', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -500, balance: 900 },
  { id: 147, date: '4-Nov', truckNo: 'T225 EFU', goingDo: '6726', start: 'DAR', from: 'DAR', to: 'Kamoa', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, balance: 1260 },
  { id: 148, date: '5-Nov', truckNo: 'T740 ELY', goingDo: '6727', start: 'DAR', from: 'DAR', to: 'Likasi', totalLts: 2200, extra: 80, darYard: -550, mbeyaGoing: -450, tdmGoing: -380, balance: 900 },
  { id: 149, date: '5-Nov', truckNo: 'T905 EKY', goingDo: '6728', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 150, date: '6-Nov', truckNo: 'T844 EKS', goingDo: '6729', returnDo: '6902', start: 'DAR', from: 'TCC', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 151, date: '6-Nov', truckNo: 'T573 EAF', goingDo: '6730', start: 'DAR', from: 'DAR', to: 'Lubumbashi', totalLts: 2100, extra: 60, darYard: -550, mbeyaGoing: -450, congoFuel: -260, balance: 900 },
  { id: 152, date: '7-Nov', truckNo: 'T629 ELE', goingDo: '6731', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 30, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 870 },
  { id: 153, date: '7-Nov', truckNo: 'T532 EEQ', goingDo: '6732', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 154, date: '8-Nov', truckNo: 'T706 DXY', goingDo: '6733', start: 'DAR', from: 'DAR', to: 'Kamoa', totalLts: 2200, extra: 100, darYard: -550, mbeyaGoing: -450, balance: 1300 },
  { id: 155, date: '8-Nov', truckNo: 'T892 EEU', goingDo: '6734', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 900 },
  { id: 156, date: '9-Nov', truckNo: 'T155 EGJ', goingDo: '6735', returnDo: '6903', start: 'DAR', from: 'KAMOA', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, balance: 1460 },
  { id: 157, date: '9-Nov', truckNo: 'T758 DNH', goingDo: '6736', start: 'DAR', from: 'DAR', to: 'Likasi', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 158, date: '10-Nov', truckNo: 'T404 EAF', goingDo: '6737', start: 'DAR', from: 'DAR', to: 'Lubumbashi', totalLts: 2100, extra: 100, darYard: -550, mbeyaGoing: -450, congoFuel: -300, balance: 900 },
  { id: 159, date: '10-Nov', truckNo: 'T669 ECQ', goingDo: '6738', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 50, darYard: -550, mbeyaGoing: -450, zambiaGoing: -130, balance: 820 },
  { id: 160, date: '11-Nov', truckNo: 'T715 EHJ', goingDo: '6739', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 161, date: '11-Nov', truckNo: 'T843 EKS', goingDo: '6740', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 162, date: '12-Nov', truckNo: 'T145 DZY', goingDo: '6741', returnDo: '6904', start: 'DAR', from: 'COMIKA', to: 'DAR', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 163, date: '12-Nov', truckNo: 'T534 EEQ', goingDo: '6742', start: 'DAR', from: 'DAR', to: 'Kamoa', totalLts: 2200, extra: 80, darYard: -550, mbeyaGoing: -450, balance: 1280 },
  { id: 164, date: '13-Nov', truckNo: 'T752 ELY', goingDo: '6743', start: 'DAR', from: 'DAR', to: 'Likasi', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 165, date: '13-Nov', truckNo: 'T166 EGJ', goingDo: '6744', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, balance: 900 },
  { id: 166, date: '14-Nov', truckNo: 'T642 EAF', goingDo: '6745', returnDo: '6905', start: 'DAR', from: 'ZHANFEI', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, zambiaGoing: -400, balance: 500 },
  { id: 167, date: '14-Nov', truckNo: 'T708 DXY', goingDo: '6746', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -500, balance: 900 },
  { id: 168, date: '15-Nov', truckNo: 'T882 EEU', goingDo: '6747', start: 'DAR', from: 'DAR', to: 'Lubumbashi', totalLts: 2100, extra: 60, darYard: -550, mbeyaGoing: -450, congoFuel: -260, balance: 900 },
  { id: 169, date: '15-Nov', truckNo: 'T407 EAF', goingDo: '6748', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 30, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 870 },
  { id: 170, date: '16-Nov', truckNo: 'T840 EKS', goingDo: '6749', start: 'DAR', from: 'DAR', to: 'Kamoa', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, balance: 1260 },
  { id: 171, date: '16-Nov', truckNo: 'T157 EGJ', goingDo: '6750', returnDo: '6906', start: 'DAR', from: 'TCC', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 172, date: '17-Nov', truckNo: 'T665 ECQ', goingDo: '6751', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 173, date: '17-Nov', truckNo: 'T533 EEQ', goingDo: '6752', start: 'DAR', from: 'DAR', to: 'Likasi', totalLts: 2200, extra: 80, darYard: -550, mbeyaGoing: -450, tdmGoing: -380, balance: 900 },
  { id: 174, date: '18-Nov', truckNo: 'T241 ELV', goingDo: '6753', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 175, date: '18-Nov', truckNo: 'T711 DXY', goingDo: '6754', returnDo: '6907', start: 'DAR', from: 'KAMOA', to: 'DAR', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, balance: 1500 },
  { id: 176, date: '19-Nov', truckNo: 'T886 EEU', goingDo: '6755', start: 'DAR', from: 'DAR', to: 'Lubumbashi', totalLts: 2100, extra: 100, darYard: -550, mbeyaGoing: -450, congoFuel: -300, balance: 900 },
  { id: 177, date: '19-Nov', truckNo: 'T644 EAF', goingDo: '6756', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 50, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 890 },
  { id: 178, date: '20-Nov', truckNo: 'T158 EGJ', goingDo: '6757', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 179, date: '20-Nov', truckNo: 'T755 ELY', goingDo: '6758', start: 'DAR', from: 'DAR', to: 'Kamoa', totalLts: 2200, extra: 80, darYard: -550, mbeyaGoing: -450, balance: 1280 },
  { id: 180, date: '21-Nov', truckNo: 'T535 EEQ', goingDo: '6759', returnDo: '6908', start: 'DAR', from: 'COMIKA', to: 'DAR', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 181, date: '21-Nov', truckNo: 'T842 EKS', goingDo: '6760', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
  { id: 182, date: '22-Nov', truckNo: 'T710 DXY', goingDo: '6761', start: 'DAR', from: 'DAR', to: 'Likasi', totalLts: 2200, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -360, balance: 900 },
  { id: 183, date: '22-Nov', truckNo: 'T406 EAF', goingDo: '6762', returnDo: '6909', start: 'DAR', from: 'ZHANFEI', to: 'DAR', totalLts: 2400, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -600, zambiaGoing: -400, congoFuel: -100, zambiaReturn: -400, balance: 0 },
  { id: 184, date: '23-Nov', truckNo: 'T670 ECQ', goingDo: '6763', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 185, date: '23-Nov', truckNo: 'T884 EEU', goingDo: '6764', start: 'DAR', from: 'DAR', to: 'Lubumbashi', totalLts: 2100, extra: 60, darYard: -550, mbeyaGoing: -450, congoFuel: -260, balance: 900 },
  { id: 186, date: '24-Nov', truckNo: 'T753 ELY', goingDo: '6765', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 30, darYard: -550, mbeyaGoing: -450, tdmGoing: -60, balance: 870 },
  { id: 187, date: '24-Nov', truckNo: 'T159 EGJ', goingDo: '6766', start: 'DAR', from: 'DAR', to: 'Kamoa', totalLts: 2200, extra: 100, darYard: -550, mbeyaGoing: -450, balance: 1300 },
  { id: 188, date: '25-Nov', truckNo: 'T645 EAF', goingDo: '6767', returnDo: '6910', start: 'DAR', from: 'TCC', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 189, date: '25-Nov', truckNo: 'T536 EEQ', goingDo: '6768', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 100, darYard: -550, mbeyaGoing: -450, tdmGoing: -500, balance: 900 },
  { id: 190, date: '26-Nov', truckNo: 'T704 DXY', goingDo: '6769', start: 'DAR', from: 'DAR', to: 'Kolwezi', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -560, balance: 900 },
  { id: 191, date: '26-Nov', truckNo: 'T244 ELV', goingDo: '6770', start: 'DAR', from: 'DAR', to: 'Likasi', totalLts: 2200, extra: 80, darYard: -550, mbeyaGoing: -450, tdmGoing: -380, balance: 900 },
  { id: 192, date: '27-Nov', truckNo: 'T888 EEU', goingDo: '6771', returnDo: '6911', start: 'DAR', from: 'KAMOA', to: 'DAR', totalLts: 2400, extra: 60, darYard: -550, mbeyaGoing: -450, balance: 1460 },
  { id: 193, date: '27-Nov', truckNo: 'T672 ECQ', goingDo: '6772', start: 'DAR', from: 'DAR', to: 'Lubumbashi', totalLts: 2100, extra: 100, darYard: -550, mbeyaGoing: -450, congoFuel: -300, balance: 900 },
  { id: 194, date: '28-Nov', truckNo: 'T845 EKS', goingDo: '6773', start: 'DAR', from: 'DAR', to: 'Lusaka', totalLts: 1900, extra: 50, darYard: -550, mbeyaGoing: -450, zambiaGoing: -130, balance: 820 },
  { id: 195, date: '28-Nov', truckNo: 'T160 EGJ', goingDo: '6774', start: 'DAR', from: 'DAR', to: 'TFM', totalLts: 2300, extra: 60, darYard: -550, mbeyaGoing: -450, tdmGoing: -460, balance: 900 },
];

// Mock Dashboard Stats
const mockDashboardStats: DashboardStats = {
  totalDOs: 485,
  totalLPOs: 1041,
  totalFuelRecords: 195,
  activeTrips: 52,
  totalTonnage: 15520,
  totalLiters: 428700,
  totalRevenue: 2780400,
};

// Mock Users
const mockUsers: User[] = [
  {
    id: 1,
    username: 'superadmin',
    email: 'super@fuelorder.com',
    firstName: 'Super',
    lastName: 'Administrator',
    role: 'super_admin',
    department: 'IT',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    username: 'admin',
    email: 'admin@fuelorder.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    department: 'Operations',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 3,
    username: 'manager',
    email: 'manager@fuelorder.com',
    firstName: 'John',
    lastName: 'Manager',
    role: 'manager',
    department: 'Operations',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 4,
    username: 'supervisor',
    email: 'supervisor@fuelorder.com',
    firstName: 'Jane',
    lastName: 'Supervisor',
    role: 'supervisor',
    department: 'Logistics',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 5,
    username: 'clerk',
    email: 'clerk@fuelorder.com',
    firstName: 'Alice',
    lastName: 'Clerk',
    role: 'clerk',
    department: 'Data Entry',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 6,
    username: 'driver1',
    email: 'driver1@fuelorder.com',
    firstName: 'Bob',
    lastName: 'Driver',
    role: 'driver',
    department: 'Transport',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 7,
    username: 'viewer',
    email: 'viewer@fuelorder.com',
    firstName: 'Charlie',
    lastName: 'Viewer',
    role: 'viewer',
    department: 'Monitoring',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

// Mock API with delay to simulate network
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to get the next DO or SDO number
export const getNextDONumber = (type: 'DO' | 'SDO' = 'DO'): number => {
  const filtered = mockDeliveryOrders.filter(order => order.doType === type);
  
  if (filtered.length === 0) {
    // If no DOs/SDOs exist, start from a default number
    return type === 'DO' ? 6000 : 5000;
  }
  
  // Extract numeric values from doNumber and find the maximum
  const maxNumber = Math.max(
    ...filtered.map(order => {
      const num = parseInt(order.doNumber);
      return isNaN(num) ? 0 : num;
    })
  );
  
  return maxNumber + 1;
};

export const mockAPI = {
  deliveryOrders: {
    getAll: async (filters?: any): Promise<DeliveryOrder[]> => {
      await delay(500);
      let filtered = [...mockDeliveryOrders];
      
      if (filters?.importOrExport && filters.importOrExport !== 'ALL') {
        filtered = filtered.filter(d => d.importOrExport === filters.importOrExport);
      }
      if (filters?.clientName) {
        filtered = filtered.filter(d => 
          d.clientName.toLowerCase().includes(filters.clientName.toLowerCase())
        );
      }
      if (filters?.truckNo) {
        filtered = filtered.filter(d => 
          d.truckNo.toLowerCase().includes(filters.truckNo.toLowerCase())
        );
      }
      
      return filtered;
    },
    
    getById: async (id: number): Promise<DeliveryOrder> => {
      await delay(300);
      const item = mockDeliveryOrders.find(d => d.id === id);
      if (!item) throw new Error('Not found');
      return item;
    },
    
    create: async (data: Partial<DeliveryOrder>): Promise<DeliveryOrder> => {
      await delay(400);
      const newId = mockDeliveryOrders.length > 0 
        ? Math.max(...mockDeliveryOrders.map(d => Number(d.id) || 0)) + 1 
        : 1;
      
      const newOrder: DeliveryOrder = {
        id: newId,
        sn: newId,
        date: data.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        importOrExport: data.importOrExport || 'IMPORT',
        doType: data.doType || 'DO',
        doNumber: data.doNumber || '',
        clientName: data.clientName || '',
        truckNo: data.truckNo || '',
        trailerNo: data.trailerNo || '',
        containerNo: data.containerNo || 'LOOSE CARGO',
        loadingPoint: data.loadingPoint || '',
        destination: data.destination || '',
        haulier: data.haulier || '',
        tonnages: data.tonnages || 0,
        ratePerTon: data.ratePerTon || 0,
        driverName: data.driverName,
        invoiceNos: data.invoiceNos,
      };
      
      mockDeliveryOrders.push(newOrder);
      console.log('Created DO:', newOrder);
      return newOrder;
    },
    
    update: async (id: number, data: Partial<DeliveryOrder>): Promise<DeliveryOrder> => {
      await delay(400);
      const index = mockDeliveryOrders.findIndex(d => d.id === id);
      if (index === -1) throw new Error('Delivery order not found');
      
      const updatedOrder: DeliveryOrder = {
        ...mockDeliveryOrders[index],
        ...data,
        id, // Preserve the original ID
      };
      
      mockDeliveryOrders[index] = updatedOrder;
      console.log('Updated DO:', updatedOrder);
      return updatedOrder;
    },
    
    delete: async (id: number): Promise<void> => {
      await delay(300);
      const index = mockDeliveryOrders.findIndex(d => d.id === id);
      if (index === -1) throw new Error('Delivery order not found');
      
      mockDeliveryOrders.splice(index, 1);
      console.log('Deleted DO with id:', id);
    },
    
    getNextNumber: async (type: 'DO' | 'SDO' = 'DO'): Promise<number> => {
      await delay(100);
      return getNextDONumber(type);
    },
  },
  
  lpos: {
    getAll: async (filters?: any): Promise<LPOEntry[]> => {
      await delay(500);
      let filtered = [...mockLPOEntries];
      
      if (filters?.station) {
        filtered = filtered.filter(l => 
          l.dieselAt.toLowerCase().includes(filters.station.toLowerCase())
        );
      }
      if (filters?.truckNo) {
        filtered = filtered.filter(l => 
          l.truckNo.toLowerCase().includes(filters.truckNo.toLowerCase())
        );
      }
      
      return filtered;
    },
    
    getById: async (id: number): Promise<LPOEntry> => {
      await delay(300);
      const item = mockLPOEntries.find(l => l.id === id);
      if (!item) throw new Error('Not found');
      return item;
    },
  },
  
  fuelRecords: {
    getAll: async (filters?: any): Promise<FuelRecord[]> => {
      await delay(500);
      let filtered = [...mockFuelRecords];
      
      if (filters?.truckNo) {
        filtered = filtered.filter(f => 
          f.truckNo.toLowerCase().includes(filters.truckNo.toLowerCase())
        );
      }
      if (filters?.to) {
        filtered = filtered.filter(f => 
          f.to.toLowerCase().includes(filters.to.toLowerCase())
        );
      }
      
      return filtered;
    },
    
    getById: async (id: number): Promise<FuelRecord> => {
      await delay(300);
      const item = mockFuelRecords.find(f => f.id === id);
      if (!item) throw new Error('Not found');
      return item;
    },
  },
  
  dashboard: {
    getStats: async (): Promise<DashboardStats> => {
      await delay(300);
      return mockDashboardStats;
    },
  },

  users: {
    getAll: async (_filters?: any): Promise<User[]> => {
      await delay(500);
      return mockUsers.filter(u => u.isActive);
    },
    
    getById: async (id: number): Promise<User> => {
      await delay(300);
      const user = mockUsers.find(u => u.id === id);
      if (!user) throw new Error('User not found');
      return user;
    },

    create: async (data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> => {
      await delay(600);
      const newUser: User = {
        ...data,
        id: mockUsers.length + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockUsers.push(newUser);
      return newUser;
    },
  },
};
