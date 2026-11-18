import React, { useState } from 'react';
import { FilePlus2, ImagePlus, Plus, Trash2, Upload } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { AreaUnit, PropertyStatus, PropertyType } from '../types/crm';
import { Breadcrumbs } from '../components/common/UIPrimitives';
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

  // Section B — Property Details
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PropertyType>('Plot / Land');
  const [location, setLocation] = useState('');
  const [areaValue, setAreaValue] = useState('');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('Cents');
  const [askingPrice, setAskingPrice] = useState('');
  const [description, setDescription] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState(currentUser.id);
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

    if (!title.trim() || !location.trim() || !areaValue || !askingPrice) {
      setErrorMsg('Please complete Property Title, Location, Area, and Asking Price.');
      return;
    }

    await withLoader(async () => {
      let createdPropertyId = '';
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
                }
              : undefined,
          property: {
            title,
            type,
            location,
            areaValue: Number(areaValue),
            areaUnit,
            askingPrice: Number(askingPrice),
            description,
            assignedAgentId,
            status,
            isManaged,
            nextFollowUpDate,
            internalNotes,
            images,
            documents,
          },
        });
        createdPropertyId = res.property.id;
        return res.db;
      }, 'Seller & Property registered across CRM');

      if (ok && createdPropertyId) {
        navigate({ page: 'property-detail', id: createdPropertyId });
      }
    }, 360);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
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
          Register a property owner and listing together in one streamlined workflow.
        </p>
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
                Create a new seller profile or attach to an existing owner.
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
            <div>
              <label className="block text-xs font-medium text-[#20251F] mb-1.5">
                Select Existing Seller *
              </label>
              <select
                value={existingSellerId}
                onChange={(e) => setExistingSellerId(e.target.value)}
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
              Section B — Property Details
            </h2>
            <p className="text-xs text-[#77796F]">
              Keep structured fields focused; describe terrain, road access, utilities, and landmarks in the rich description below.
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
                Location *
              </label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Kanhangad, Kasaragod"
                className="w-full h-10 px-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
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
                Asking Price ({db.settings.currencySymbol}) *
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                required
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                placeholder="2500000"
                className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B]"
              />
            </div>

            <div>
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

            {/* Large Property Description */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#20251F]">
                  Property Description
                </label>
                <span className="text-[11px] text-[#77796F]">
                  Road access · Water · Electricity · Boundary · Terrain · Soil · Landmarks · Amenities
                </span>
              </div>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe road access width & surface, well/borewell water availability, 3-phase electricity, compound wall or boundary fencing, terrain & soil type, nearby schools/hospitals/highway distance, residential surroundings, and special amenities..."
                className="w-full p-3 text-sm bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg focus:outline-none focus:border-[#064E3B] leading-relaxed"
              />
            </div>
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
            Save Seller & Property
          </button>
        </div>
      </form>
    </div>
  );
};
