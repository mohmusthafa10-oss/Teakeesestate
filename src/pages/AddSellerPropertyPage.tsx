import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FilePlus2, ImagePlus, Plus, Trash2, Upload } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { apiClient } from '../services/apiClient';
import {
  ADVANCE_PAYMENT_METHODS,
  crmService,
  nextTakCode,
  SELLER_RELATIONSHIPS,
} from '../services/crmService';
import {
  AdvancePaymentMethod,
  AreaUnit,
  PropertyCategory,
  PropertyStatus,
  PropertyType,
  SellerRelationship,
} from '../types/crm';
import { Breadcrumbs } from '../components/common/UIPrimitives';
import { LocationPickerMap } from '../components/map/LocationPickerMap';
import { getTodayISO } from '../utils/formatters';

const SAMPLE_LOCAL_GALLERY = [
  {
    label: 'Residential Land Plot',
    url: '/src/assets/images/prop_land_coastal_1794980388013.jpg',
  },
  {
    label: 'Luxury Courtyard Villa',
    url: '/src/assets/images/prop_villa_courtyard_1794980387156.jpg',
  },
  {
    label: 'Modern Apartment Complex',
    url: '/src/assets/images/prop_apartment_modern_1794980388955.jpg',
  },
  {
    label: 'Agricultural Plantation',
    url: '/src/assets/images/prop_agriculture_estate_1794980388181.jpg',
  },
  {
    label: 'Commercial Plaza',
    url: '/src/assets/images/prop_commercial_plaza_1794980389884.jpg',
  },
  {
    label: 'Boutique Heritage Stay',
    url: '/src/assets/images/prop_stay_homestay_1794980390926.jpg',
  },
];

export const AddSellerPropertyPage: React.FC = () => {
  const { db, currentUser, route, navigate, updateDb, withLoader, notify } = useCRM();

  const nextPropertyCode = useMemo(
    () => nextTakCode(db.properties.map((p) => p.code)),
    [db.properties]
  );

  const initialSellerMode = route.preselectedSellerId ? 'existing-seller' : 'new-seller';
  const [sellerMode, setSellerMode] = useState<'new-seller' | 'existing-seller'>(
    initialSellerMode
  );
  const [existingSellerId, setExistingSellerId] = useState(
    route.preselectedSellerId || db.sellers[0]?.id || ''
  );

  // Section A — Seller Details
  const [sellerName, setSellerName] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [sellerWhatsapp, setSellerWhatsapp] = useState('');
  const [sellerAddress, setSellerAddress] = useState('');
  const [relationshipWithProperty, setRelationshipWithProperty] =
    useState<SellerRelationship>('Owner');

  // Section B — Property Details (Type & Category separate)
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PropertyType>(
    db.settings.propertyCategories[0] || 'Land'
  );
  const [category, setCategory] = useState<PropertyCategory>(
    db.settings.propertyCategoryGroups[0] || 'Residential'
  );

  // Structured Location
  const [district, setDistrict] = useState('');
  const [panchayath, setPanchayath] = useState('');
  const [locality, setLocality] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<string | undefined>(undefined);

  // Required Specs & Pricing
  const [areaValue, setAreaValue] = useState('');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('Cents');
  const [roadConnectivity, setRoadConnectivity] = useState('');
  const [expectedPrice, setExpectedPrice] = useState('');
  const [marketPrice, setMarketPrice] = useState('');
  const [description, setDescription] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState(currentUser.id);

  // Optional Site Details
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [distanceToHighway, setDistanceToHighway] = useState('');
  const [nearbyLandmarks, setNearbyLandmarks] = useState('');
  const [waterAvailability, setWaterAvailability] = useState('');
  const [terrain, setTerrain] = useState('');
  const [frontage, setFrontage] = useState('');
  const [electricity, setElectricity] = useState('');
  const [boundaryDetails, setBoundaryDetails] = useState('');
  const [otherFeatures, setOtherFeatures] = useState('');

  const [images, setImages] = useState<{ url: string; caption: string }[]>([
    {
      url: '/src/assets/images/prop_land_coastal_1794980388013.jpg',
      caption: 'Primary property photo',
    },
  ]);
  const [documents, setDocuments] = useState<
    { name: string; docType: string; fileSize: string }[]
  >([]);

  // Section C — Listing Details
  const [status, setStatus] = useState<PropertyStatus>('Available');
  const [isManaged, setIsManaged] = useState(false);
  const [nextFollowUpDate, setNextFollowUpDate] = useState(getTodayISO());
  const [internalNotes, setInternalNotes] = useState('');

  // Section D — Seller Advance Collection (Financial tracking, not sales revenue)
  const [advanceCollected, setAdvanceCollected] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(getTodayISO());
  const [advanceMethod, setAdvanceMethod] =
    useState<AdvancePaymentMethod>('Bank Transfer');
  const [advanceRef, setAdvanceRef] = useState('');
  const [advanceRemarks, setAdvanceRemarks] = useState('');

  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState('Title Deed');
  const [errorMsg, setErrorMsg] = useState('');

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImages((prev) => [
            ...prev,
            { url: reader.result as string, caption: file.name.replace(/\.[^.]+$/, '') },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDocFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const sizeKb = Math.round(file.size / 1024);
      const sizeLabel = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
      setDocuments((prev) => [
        ...prev,
        { name: file.name, docType: 'Uploaded Document', fileSize: sizeLabel },
      ]);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (sellerMode === 'new-seller') {
      if (!sellerName.trim() || !sellerPhone.trim()) {
        setErrorMsg('Please enter the seller name and phone number.');
        return;
      }
    } else if (!existingSellerId) {
      setErrorMsg('Please select an existing seller.');
      return;
    }

    if (
      !title.trim() ||
      !district.trim() ||
      !panchayath.trim() ||
      !locality.trim() ||
      !areaValue ||
      !roadConnectivity.trim() ||
      !expectedPrice ||
      !description.trim()
    ) {
      setErrorMsg(
        'Please complete all required property fields: Title, District, Panchayath/Municipality, Locality, Area, Road Connectivity, Expected Price, and Description.'
      );
      return;
    }

    if (advanceCollected && (!advanceAmount || Number(advanceAmount) <= 0 || !advanceDate)) {
      setErrorMsg('Please enter a valid Advance Amount and Collection Date.');
      return;
    }

    await withLoader(async () => {
      let createdPropertyId = '';

      // If authenticated with backend, persist to central database
      if (localStorage.getItem('crm_access_token')) {
        try {
          const payload = {
            mode: sellerMode,
            existing_seller_id: sellerMode === 'existing-seller' ? existingSellerId : undefined,
            seller:
              sellerMode === 'new-seller'
                ? {
                    name: sellerName.trim(),
                    phone: sellerPhone.trim(),
                    whatsapp: (sellerWhatsapp || sellerPhone).trim(),
                    address: sellerAddress.trim() || undefined,
                    relationship_with_property: relationshipWithProperty,
                    assigned_agent_id: assignedAgentId || currentUser.id,
                  }
                : undefined,
            property: {
              title: title.trim(),
              type,
              category,
              district: district.trim(),
              panchayath: panchayath.trim(),
              locality: locality.trim() || undefined,
              full_address: fullAddress.trim() || undefined,
              google_maps_url: googleMapsUrl.trim() || undefined,
              area_value: Number(areaValue),
              area_unit: areaUnit,
              seller_id: sellerMode === 'existing-seller' ? existingSellerId : '',
              expected_price: Number(expectedPrice),
              market_price: marketPrice ? Number(marketPrice) : undefined,
              description: description.trim() || undefined,
              seller_relationship: relationshipWithProperty,
              assigned_agent_id: assignedAgentId || currentUser.id,
              status,
              road_connectivity: roadConnectivity.trim() || undefined,
              distance_to_highway: distanceToHighway.trim() || undefined,
              nearby_landmarks: nearbyLandmarks.trim() || undefined,
              water_availability: waterAvailability.trim() || undefined,
              terrain: terrain.trim() || undefined,
              frontage: frontage.trim() || undefined,
              electricity: electricity.trim() || undefined,
              boundary_details: boundaryDetails.trim() || undefined,
              other_features: otherFeatures.trim() || undefined,
              internal_notes: internalNotes.trim() || undefined,
              latitude: latitude ?? undefined,
              longitude: longitude ?? undefined,
              location_accuracy: locationAccuracy ?? undefined,
              images: images.map((img, idx) => ({
                url: img.url,
                caption: img.caption || 'Property Image',
                is_primary: idx === 0,
              })),
            },
            advance: advanceCollected
              ? {
                  amount: Number(advanceAmount),
                  collection_date: advanceDate || undefined,
                  payment_method: advanceMethod,
                  transaction_reference: advanceRef || undefined,
                  remarks: advanceRemarks || undefined,
                }
              : undefined,
          };

          const apiRes = await apiClient.registerSellerAndProperty(payload);
          createdPropertyId = apiRes.property.id;
        } catch (apiErr: any) {
          setErrorMsg(apiErr.message || 'Failed to register property with backend database.');
          return;
        }
      }

      const ok = updateDb((prev) => {
        const res = crmService.registerSellerAndProperty(prev, {
          mode: sellerMode,
          existingSellerId,
          seller:
            sellerMode === 'new-seller'
              ? {
                  name: sellerName,
                  phone: sellerPhone,
                  whatsapp: sellerWhatsapp || sellerPhone,
                  address: sellerAddress,
                  relationshipWithProperty,
                }
              : undefined,
          property: {
            title,
            type,
            category,
            district,
            panchayath,
            locality,
            fullAddress,
            googleMapsUrl,
            latitude,
            longitude,
            location_accuracy: locationAccuracy,
            areaValue: Number(areaValue),
            areaUnit,
            roadConnectivity,
            distanceToHighway,
            nearbyLandmarks,
            waterAvailability,
            terrain,
            frontage,
            electricity,
            boundaryDetails,
            otherFeatures,
            expectedPrice: Number(expectedPrice),
            marketPrice: marketPrice ? Number(marketPrice) : undefined,
            description,
            sellerRelationship: relationshipWithProperty,
            assignedAgentId,
            status,
            isManaged,
            nextFollowUpDate,
            internalNotes,
            images,
            documents,
          },
          advance: advanceCollected
            ? {
                collected: true,
                amount: Number(advanceAmount),
                collectionDate: advanceDate,
                paymentMethod: advanceMethod,
                transactionReference: advanceRef,
                remarks: advanceRemarks,
              }
            : undefined,
        });
        if (!createdPropertyId) {
          createdPropertyId = res.property.id;
        }
        return res.db;
      }, `Seller & Property (${nextPropertyCode}) registered across CRM`);

      if (createdPropertyId) {
        navigate({ page: 'property-detail', id: createdPropertyId });
      }
    }, 360);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <Breadcrumbs
            items={[
              { label: 'Properties', onClick: () => navigate({ page: 'properties' }) },
              { label: 'Add Seller + Property' },
            ]}
          />
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            {sellerMode === 'new-seller'
              ? 'Add Seller + Property'
              : 'Add Property to Existing Seller'}
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Register a property owner, structured location, pricing, and optional advance record in one workflow.
          </p>
        </div>
        <div className="px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E4DA] text-xs shrink-0">
          <span className="text-[#77796F]">Auto Property ID: </span>
          <span className="font-mono font-semibold text-[#064E3B]">{nextPropertyCode}</span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-[#C96C60]/12 border border-[#C96C60]/40 text-xs text-[#8D382E] font-medium">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section A — Seller Details */}
        <section className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E4DA]">
            <div>
              <h2 className="text-sm font-semibold text-[#20251F]">
                Section A — Seller Details
              </h2>
              <p className="text-xs text-[#77796F]">
                Create a new seller profile or attach to an existing owner and specify their property relationship.
              </p>
            </div>
            <div className="inline-flex p-1 rounded-lg bg-[#F1F0E8] border border-[#E5E4DA] shrink-0">
              <button
                type="button"
                onClick={() => setSellerMode('new-seller')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  sellerMode === 'new-seller'
                    ? 'bg-[#FFFFFF] text-[#064E3B] shadow-xs'
                    : 'text-[#77796F] hover:text-[#20251F]'
                }`}
              >
                New Seller
              </button>
              <button
                type="button"
                onClick={() => setSellerMode('existing-seller')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  sellerMode === 'existing-seller'
                    ? 'bg-[#FFFFFF] text-[#064E3B] shadow-xs'
                    : 'text-[#77796F] hover:text-[#20251F]'
                }`}
              >
                Existing Seller
              </button>
            </div>
          </div>

          {sellerMode === 'existing-seller' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Select Existing Seller *
                </label>
                <select
                  value={existingSellerId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setExistingSellerId(id);
                    const found = db.sellers.find((s) => s.id === id);
                    if (found?.relationshipWithProperty) {
                      setRelationshipWithProperty(found.relationshipWithProperty);
                    }
                  }}
                  className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                >
                  <option value="">Choose seller...</option>
                  {db.sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) — {s.phone}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Relationship with Property *
                </label>
                <select
                  value={relationshipWithProperty}
                  onChange={(e) =>
                    setRelationshipWithProperty(e.target.value as SellerRelationship)
                  }
                  className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                >
                  {SELLER_RELATIONSHIPS.map((rel) => (
                    <option key={rel} value={rel}>
                      {rel}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Seller Name *
                </label>
                <input
                  type="text"
                  required
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  placeholder="e.g. Narayanan Kutty"
                  className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={sellerPhone}
                  onChange={(e) => setSellerPhone(e.target.value)}
                  placeholder="+91 98470 00000"
                  className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  WhatsApp Number
                </label>
                <input
                  type="tel"
                  value={sellerWhatsapp}
                  onChange={(e) => setSellerWhatsapp(e.target.value)}
                  placeholder="Same as phone if left blank"
                  className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Relationship with Property *
                </label>
                <select
                  value={relationshipWithProperty}
                  onChange={(e) =>
                    setRelationshipWithProperty(e.target.value as SellerRelationship)
                  }
                  className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                >
                  {SELLER_RELATIONSHIPS.map((rel) => (
                    <option key={rel} value={rel}>
                      {rel}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Address
                </label>
                <input
                  type="text"
                  value={sellerAddress}
                  onChange={(e) => setSellerAddress(e.target.value)}
                  placeholder="Locality, Town, District"
                  className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                />
              </div>
            </div>
          )}
        </section>

        {/* Section B — Property Details */}
        <section className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-5">
          <div className="pb-3 border-b border-[#E5E4DA]">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Section B — Property Classification, Location & Details
            </h2>
            <p className="text-xs text-[#77796F]">
              Property Type and Category are stored separately. Required fields are marked with *.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Property Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 14 Cent Residential Plot near Kanhangad South"
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Property Type *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PropertyType)}
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              >
                {db.settings.propertyCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PropertyCategory)}
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              >
                {db.settings.propertyCategoryGroups.map((grp) => (
                  <option key={grp} value={grp}>
                    {grp}
                  </option>
                ))}
              </select>
            </div>

            {/* Structured Location Fields */}
            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                District *
              </label>
              <input
                type="text"
                required
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="e.g. Kasaragod"
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Panchayath / Municipality / Corporation *
              </label>
              <input
                type="text"
                required
                value={panchayath}
                onChange={(e) => setPanchayath(e.target.value)}
                placeholder="e.g. Kanhangad Municipality"
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Locality / Place *
              </label>
              <input
                type="text"
                required
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                placeholder="e.g. Alamipally"
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Google Maps Location (Optional)
              </label>
              <input
                type="url"
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="https://maps.google.com/?q=..."
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Full Address (Optional)
              </label>
              <input
                type="text"
                value={fullAddress}
                onChange={(e) => setFullAddress(e.target.value)}
                placeholder="Plot / Door No., Street, Post Office, PIN Code"
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Map Pin &amp; Geo-Coordinates (Optional — leave unpinned to save as Location Pending)
              </label>
              <LocationPickerMap
                latitude={latitude}
                longitude={longitude}
                locationAccuracy={locationAccuracy}
                addressHint={[locality, panchayath, district].filter(Boolean).join(', ')}
                onChange={(next) => {
                  setLatitude(next.latitude);
                  setLongitude(next.longitude);
                  setLocationAccuracy(next.locationAccuracy);
                  if (
                    next.latitude !== null &&
                    next.longitude !== null &&
                    (!googleMapsUrl || googleMapsUrl.startsWith('https://www.google.com/maps?q='))
                  ) {
                    setGoogleMapsUrl(
                      `https://www.google.com/maps?q=${next.latitude},${next.longitude}`
                    );
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Area / Size *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  required
                  value={areaValue}
                  onChange={(e) => setAreaValue(e.target.value)}
                  placeholder="14"
                  className="flex-1 h-10 px-3 text-sm font-mono tabular-nums bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                />
                <select
                  value={areaUnit}
                  onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}
                  className="w-28 h-10 px-2.5 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                >
                  <option value="Cents">Cents</option>
                  <option value="Sq.ft">Sq.ft</option>
                  <option value="Acres">Acres</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Road Connectivity *
              </label>
              <input
                type="text"
                required
                value={roadConnectivity}
                onChange={(e) => setRoadConnectivity(e.target.value)}
                placeholder="e.g. 12ft Tarred Panchayath Road"
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Expected Price ({db.settings.currencySymbol}) * — Seller Asking
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                required
                value={expectedPrice}
                onChange={(e) => setExpectedPrice(e.target.value)}
                placeholder="2500000"
                className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Estimated Market Price ({db.settings.currencySymbol}) (Optional)
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={marketPrice}
                onChange={(e) => setMarketPrice(e.target.value)}
                placeholder="2350000"
                className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Assigned Agent
              </label>
              <select
                value={assignedAgentId}
                onChange={(e) => setAssignedAgentId(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              >
                {db.users
                  .filter((u) => u.active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
              </select>
            </div>

            {/* Required Property Description */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#20251F]">
                  Property Description *
                </label>
                <span className="text-[11px] text-[#77796F]">
                  Key highlights, zoning, neighborhood & site overview
                </span>
              </div>
              <textarea
                rows={4}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe plot orientation, neighborhood profile, title clarity, and investment or residential suitability..."
                className="w-full p-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B] leading-relaxed"
              />
            </div>
          </div>

          {/* Collapsible Optional Property Site Details */}
          <div className="border border-[#E5E4DA] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptionalDetails((v) => !v)}
              className="w-full px-4 py-3 bg-[#F1F0E8]/60 hover:bg-[#E4EBE0]/50 flex items-center justify-between text-xs font-semibold text-[#20251F] cursor-pointer"
            >
              <span>
                Optional Property Details (Highway Distance, Water, Terrain, Utilities — editable later)
              </span>
              {showOptionalDetails ? (
                <ChevronUp className="w-4 h-4 text-[#064E3B]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#064E3B]" />
              )}
            </button>
            {showOptionalDetails && (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-[#FFFFFF]">
                <div>
                  <label className="block text-xs font-medium text-[#20251F] mb-1">
                    Distance to Highway
                  </label>
                  <input
                    type="text"
                    value={distanceToHighway}
                    onChange={(e) => setDistanceToHighway(e.target.value)}
                    placeholder="e.g. 600 m to NH-66"
                    className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#20251F] mb-1">
                    Nearby Landmarks
                  </label>
                  <input
                    type="text"
                    value={nearbyLandmarks}
                    onChange={(e) => setNearbyLandmarks(e.target.value)}
                    placeholder="e.g. Chinmaya Vidyalaya, District Hospital"
                    className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#20251F] mb-1">
                    Well / Water Availability
                  </label>
                  <input
                    type="text"
                    value={waterAvailability}
                    onChange={(e) => setWaterAvailability(e.target.value)}
                    placeholder="e.g. Open well + Municipal water"
                    className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#20251F] mb-1">
                    Terrain
                  </label>
                  <input
                    type="text"
                    value={terrain}
                    onChange={(e) => setTerrain(e.target.value)}
                    placeholder="e.g. Flat dry land / Gentle slope"
                    className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#20251F] mb-1">
                    Frontage
                  </label>
                  <input
                    type="text"
                    value={frontage}
                    onChange={(e) => setFrontage(e.target.value)}
                    placeholder="e.g. 65 ft road frontage"
                    className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#20251F] mb-1">
                    Electricity
                  </label>
                  <input
                    type="text"
                    value={electricity}
                    onChange={(e) => setElectricity(e.target.value)}
                    placeholder="e.g. 3-Phase KSEB line available"
                    className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#20251F] mb-1">
                    Boundary Details
                  </label>
                  <input
                    type="text"
                    value={boundaryDetails}
                    onChange={(e) => setBoundaryDetails(e.target.value)}
                    placeholder="e.g. Laterite compound wall on 3 sides"
                    className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#20251F] mb-1">
                    Other Features
                  </label>
                  <input
                    type="text"
                    value={otherFeatures}
                    onChange={(e) => setOtherFeatures(e.target.value)}
                    placeholder="e.g. Yielding coconut trees, clear single patta"
                    className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Property Photos */}
          <div className="pt-2 border-t border-[#E5E4DA] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[#20251F]">
                Property Photos ({images.length})
              </label>
              <div className="flex items-center gap-2">
                <label className="px-3 py-1.5 rounded-lg border border-[#E5E4DA] bg-[#F1F0E8]/60 hover:bg-[#E4EBE0] text-xs font-medium text-[#20251F] flex items-center gap-1.5 cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5 text-[#064E3B]" />
                  Upload Image Files
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageFileUpload}
                    className="hidden"
                  />
                </label>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const chosen = SAMPLE_LOCAL_GALLERY.find((g) => g.url === e.target.value);
                    if (chosen) {
                      setImages((prev) => [
                        ...prev,
                        { url: chosen.url, caption: chosen.label },
                      ]);
                      notify('Added gallery photo');
                    }
                    e.target.value = '';
                  }}
                  className="h-8 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
                >
                  <option value="">+ Add from Agency Gallery</option>
                  {SAMPLE_LOCAL_GALLERY.map((g) => (
                    <option key={g.url} value={g.url}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {images.map((img, idx) => (
                <div
                  key={`${img.url.slice(0, 24)}-${idx}`}
                  className="border border-[#E5E4DA] rounded-xl p-2 bg-[#F1F0E8]/30 space-y-2"
                >
                  <img
                    src={img.url}
                    alt={img.caption}
                    className="w-full h-28 object-cover rounded-lg bg-[#E4EBE0]"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={img.caption}
                      onChange={(e) =>
                        setImages((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, caption: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Photo caption"
                      className="flex-1 h-7 px-2 text-[11px] bg-[#FFFFFF] border border-[#E5E4DA] rounded"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setImages((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1 text-[#C96C60] hover:bg-[#C96C60]/10 rounded cursor-pointer"
                      aria-label="Remove photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <div className="pt-2 border-t border-[#E5E4DA] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[#20251F]">
                Documents & Deeds ({documents.length})
              </label>
              <label className="px-3 py-1.5 rounded-lg border border-[#E5E4DA] bg-[#F1F0E8]/60 hover:bg-[#E4EBE0] text-xs font-medium text-[#20251F] flex items-center gap-1.5 cursor-pointer transition-colors">
                <FilePlus2 className="w-3.5 h-3.5 text-[#064E3B]" />
                Attach Files
                <input
                  type="file"
                  multiple
                  onChange={handleDocFileAttach}
                  className="hidden"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="Document reference name (e.g. Tax_Receipt_2026.pdf)"
                className="flex-1 min-w-[200px] h-9 px-3 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
              />
              <select
                value={newDocType}
                onChange={(e) => setNewDocType(e.target.value)}
                className="h-9 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
              >
                <option value="Title Deed">Title Deed</option>
                <option value="Survey Sketch">Survey Sketch</option>
                <option value="Tax Receipt">Tax Receipt</option>
                <option value="Building Permit">Building Permit</option>
                <option value="Owner Mandate">Owner Mandate</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!newDocName.trim()) return;
                  setDocuments((prev) => [
                    ...prev,
                    { name: newDocName.trim(), docType: newDocType, fileSize: '1.0 MB' },
                  ]);
                  setNewDocName('');
                }}
                className="h-9 px-3 rounded-lg bg-[#E4EBE0] hover:bg-[#A8B9A2]/40 text-xs font-medium text-[#064E3B] flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Ref
              </button>
            </div>
            {documents.length > 0 && (
              <div className="divide-y divide-[#E5E4DA] border border-[#E5E4DA] rounded-lg">
                {documents.map((doc, idx) => (
                  <div
                    key={`${doc.name}-${idx}`}
                    className="px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-medium text-[#20251F]">{doc.name}</span>
                      <span className="text-[#77796F] ml-2">
                        {doc.docType} · {doc.fileSize}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDocuments((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-[#C96C60] hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section C — Listing Details */}
        <section className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-4">
          <div className="pb-3 border-b border-[#E5E4DA]">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Section C — Listing Details
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Listing Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PropertyStatus)}
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              >
                <option value="Available">Available</option>
                <option value="Under Negotiation">Under Negotiation</option>
                <option value="Reserved">Reserved</option>
                <option value="Rented">Rented</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Next Follow-up Date
              </label>
              <input
                type="date"
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2.5">
              <input
                id="managed-toggle"
                type="checkbox"
                checked={isManaged}
                onChange={(e) => setIsManaged(e.target.checked)}
                className="w-4 h-4 accent-[#064E3B]"
              />
              <label htmlFor="managed-toggle" className="text-xs text-[#20251F]">
                Agency Managed / Operating Property (stays, serviced rentals, or management mandate)
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Internal Notes
              </label>
              <textarea
                rows={3}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Commission terms, seller urgency, verification notes..."
                className="w-full p-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>
          </div>
        </section>

        {/* Section D — Seller Advance Collection */}
        <section className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E4DA]">
            <div>
              <h2 className="text-sm font-semibold text-[#20251F]">
                Section D — Seller Advance Collection
              </h2>
              <p className="text-xs text-[#77796F]">
                Record refundable/adjustable seller advances collected for marketing or onboarding (tracked as financial records, separate from sales revenue).
              </p>
            </div>
            <div className="inline-flex p-1 rounded-lg bg-[#F1F0E8] border border-[#E5E4DA] shrink-0">
              <button
                type="button"
                onClick={() => setAdvanceCollected(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  !advanceCollected
                    ? 'bg-[#FFFFFF] text-[#064E3B] shadow-xs'
                    : 'text-[#77796F] hover:text-[#20251F]'
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setAdvanceCollected(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  advanceCollected
                    ? 'bg-[#FFFFFF] text-[#064E3B] shadow-xs'
                    : 'text-[#77796F] hover:text-[#20251F]'
                }`}
              >
                Yes — Advance Collected
              </button>
            </div>
          </div>

          {advanceCollected ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Advance Amount ({db.settings.currencySymbol}) *
                </label>
                <input
                  type="number"
                  min="1"
                  required={advanceCollected}
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="25000"
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Collection Date *
                </label>
                <input
                  type="date"
                  required={advanceCollected}
                  value={advanceDate}
                  onChange={(e) => setAdvanceDate(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Payment Method
                </label>
                <select
                  value={advanceMethod}
                  onChange={(e) =>
                    setAdvanceMethod(e.target.value as AdvancePaymentMethod)
                  }
                  className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                >
                  {ADVANCE_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Transaction Reference
                </label>
                <input
                  type="text"
                  value={advanceRef}
                  onChange={(e) => setAdvanceRef(e.target.value)}
                  placeholder="e.g. UPI/6294810234 or NEFT Ref"
                  className="w-full h-10 px-3 text-sm font-mono bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                  Remarks
                </label>
                <input
                  type="text"
                  value={advanceRemarks}
                  onChange={(e) => setAdvanceRemarks(e.target.value)}
                  placeholder="e.g. Refundable listing & digital promotion advance; adjustable against closing commission"
                  className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#77796F]">
              No seller advance recorded on onboarding. Additional advance transactions can be logged anytime from the Property Profile.
            </p>
          )}
        </section>

        <div className="flex items-center justify-end gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate({ page: 'properties' })}
            className="h-10 px-5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] text-xs font-medium text-[#20251F] hover:bg-[#F1F0E8] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-10 px-6 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-semibold text-[#FFFFFF] flex items-center gap-2 transition-colors cursor-pointer"
          >
            <ImagePlus className="w-4 h-4" />
            Save Seller & Property ({nextPropertyCode})
          </button>
        </div>
      </form>
    </div>
  );
};
