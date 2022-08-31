import { HttpParams } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import {
  FormGroup,
  FormControl,
  Validators,
  FormArray,
  FormBuilder,
  AbstractControl,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap';
import {
  debounceTime,
  distinctUntilChanged,
  lastValueFrom,
  forkJoin,
  Observable,
  map,
  switchMap,
  Subject,
  takeUntil,
} from 'rxjs';
import { AuthService } from 'src/app/auth/auth.service';
import { Media } from 'src/app/core-components/media-chooser-model/media-chooser-model.component';
import { MediaChooserConfig } from 'src/app/core-components/media-chooser/media-chooser.component';
import { ControllerService } from 'src/app/services/controller.service';
import { BizStatus, MaskConfig } from 'src/app/services/core';
import { PopupService } from 'src/app/services/popup.service';
import { ServerService } from 'src/app/services/server.service';
import { SellerService } from '../seller.service';

interface MoreDetail {
  id: string;
  headerId: string;
  name: string;
  code: string;
  description: string;
  allowDetailCustomName: number;
  needDetailMapping: number;
  details: any[];
  units: any[];
  value: FormGroup;
}
export interface Alert {
  type: string;
  message: string;
}

const ALERTS = {
  def: {
    type: 'warning',
    message: 'Your product is in def stage.',
  },
};
export enum ALERTS_TYPES {
  def = 'def',
  active = 'active',
}

@Component({
  selector: 'app-product-setup',
  templateUrl: './product-setup.component.html',
  styleUrls: ['./product-setup.component.scss'],
})
export class ProductSetupComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('nav') public tabs!: any;
  @ViewChildren(NgbAlert) productAlertsComponents!: QueryList<NgbAlert>;
  public activeTab = 1;

  // Old product
  product: any;
  businessStatus = [
    { title: 'Active', value: 2 },
    { title: 'Draft', value: 6 },
  ];
  // FormGroups
  filterControlForm: FormGroup = new FormGroup({
    selectAll: new FormControl(false),
    randomIdLength: new FormControl(10),
    randomIdOptions: new FormControl([10, 9, 8, 7, 6, 5, 4]),
    dateRange: new FormControl(''),
    startDate: new FormControl(new Date()),
    endDate: new FormControl(new Date()),
    price: new FormControl(0),
    sellingPrice: new FormControl(0, [Validators.required]),
    quantity: new FormControl(0),
    condition: new FormControl(''),
  });
  categoryForm: FormGroup = new FormGroup({
    categorySearch: new FormControl(''),
    categorySearchResult: new FormControl([]),
    categorySelected: new FormControl({ path: '' }),
    lvlCategory: new FormControl(null),
  });

  vitalInfoForm: FormGroup = new FormGroup({
    id: new FormControl(),
    status: new FormControl(2),
    title: new FormControl('',{validators:Validators.required}),
    brand: new FormControl('',{validators:Validators.required}),
    manufacturer: new FormControl('',{validators:Validators.required}),
    packType: new FormControl(null,{validators:Validators.required}),
    currency: new FormControl(null,{validators:Validators.required}),
  });

  variationForm: FormGroup = new FormGroup({
    hasVariant: new FormControl(false),
  });
  productVariationForm: FormGroup = new FormGroup({
    products: new FormArray([]),
  });
  descriptionForm: FormGroup = new FormGroup({
    description: new FormControl(''),
    features: new FormArray([new FormControl('')]),
  });

  offerForm: FormGroup = new FormGroup({
    id: new FormControl('-1'),
    status: new FormControl(2),
    sellerSku: new FormControl('',{validators: Validators.required}),
    price: new FormControl(0,{validators: Validators.required}),
    sellingPrice: new FormControl(0,{validators: Validators.required}),
    quantity: new FormControl(0,{validators: Validators.required}),
    dateRange: new FormControl({ start: new Date(), end: new Date() },{validators: Validators.required}),
    condition: new FormControl(null,{validators: Validators.required}),
  });

  mediaFormControlNames = [
    { formControlName: 'media_1', title: 'Main media' },
    { formControlName: 'media_2', title: 'Right Side' },
    { formControlName: 'media_3', title: 'Left Side' },
    { formControlName: 'media_4', title: 'Up Side' },
    { formControlName: 'media_5', title: 'Bottom Side' },
    { formControlName: 'media_6', title: 'Front Side' },
    { formControlName: 'media_7', title: 'Back Side' },
    { formControlName: 'media_8', title: '' },
    { formControlName: 'media_9', title: '' },
  ];
  mediaForm: FormGroup = new FormGroup({
    media_1: new FormControl(null),
    media_2: new FormControl(null),
    media_3: new FormControl(null),
    media_4: new FormControl(null),
    media_5: new FormControl(null),
    media_6: new FormControl(null),
    media_7: new FormControl(null),
    media_8: new FormControl(null),
    media_9: new FormControl(null),
  });

  // Attributes
  moreDetails = {
    attributes: [] as any[],
  };
  conditionOptions: any[] = [];
  packTypeList: any[] = [];
  currencyByRegions: any[] = [];
  deletedProducts = new Map();
  options: any[] = [];
  isFilterFormCollapsed = true;

  marginPercentage = 0.0;
  profit = 0.0;
  decPlace = 2;

  private _productAlerts: Map<string, Alert> = new Map();
  private productAlertsController: Subject<Map<string, Alert>> = new Subject();
  public maskConfig: MaskConfig = this.http.config.mask;
  productImageConfig: MediaChooserConfig = {
    pagination: 12,
    ratio: '1/1',
  };

  // destroy all subscription onNgDestroy();
  destroy$: Subject<boolean> = new Subject<boolean>();

  constructor(
    public pgService: ControllerService,
    private authService: AuthService,
    private http: ServerService,
    public fb: FormBuilder,
    public sellerService: SellerService,
    public popup: PopupService,
    public activatedRoute: ActivatedRoute,
    public router: Router
  ) {}

  get isNew() {
    return this.vitalInfoForm.value.id;
  }

  get hasVariant(): boolean {
    return this.variationForm.controls['hasVariant'].value;
  }

  get featuresControls() {
    return (<FormArray>this.descriptionForm.get('features')).controls;
  }

  get productVariationControls(): AbstractControl[] {
    return (<FormArray>this.productVariationForm.get('products')).controls;
  }

  get showVariantImageToggle(): boolean {
    return this.productVariationControls.length > 0;
  }

  get categoryBreadCrumb() {
    return this.categoryForm.controls['categorySelected'].value?.path;
  }

  get existOptionHeaders() {
    return (
      this.options.reduce((prev: any, curr: any) => {
        return prev + curr.get('header')?.value ? 1 : 0;
      }, 0) !== 0
    );
  }

  get productAlerts(): Observable<Map<string, Alert>> {
    return this.productAlertsController;
  }

  get buyCurrency() {
    return this.vitalInfoForm.get('currency')?.value;
  }

  ngAfterViewInit(): void {
    const routeParams = this.activatedRoute.snapshot.paramMap;
    const id = routeParams.get('id');
    if (id) {
      this.tabs.select(2);
    }
  }

  async ngOnInit() {
    this.browseCategory();
    this.createVariantOption();
    this.init();
    const routeParams = this.activatedRoute.snapshot.paramMap;
    const id = routeParams.get('id');
    if (id) {
      // this.tabs.select(2);
      this.importProduct(id, null);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next(true);
    this.destroy$.unsubscribe();
  }

  init() {
    const getCondition = this.http.GET('conditions');
    const getPackTypes = this.http.GET('packtypes');
    const regions = this.sellerService.regions([
      { key: 'pagination', value: '-1' },
    ]);

    forkJoin([getCondition, getPackTypes, regions]).subscribe(
      (values: any[]) => {
        if (values[0] && values[0].status == 200) {
          this.conditionOptions = values[0].details.data;
        }
        if (values[1] && values[1].status == 200) {
          this.packTypeList = values[1].details.data;
        }
        if (values[2] && values[2].status == 200) {
          this.currencyByRegions = values[2].details.data;

          // Set default currency value by brand;
          this.vitalInfoForm.controls['currency'].setValue(
            this.currencyByRegions.find(
              (r) => r.id == this.authService.user.brand.fk_region_id
            )
          );
        }
      }
    );

    this.vitalInfoForm
      .get('status')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((value: any) => {
        if (value == BizStatus.ACTIVE) this._productAlerts.delete('def');
        else {
          this._productAlerts.set('def', ALERTS['def']);
        }
        this.productAlertsController.next(this._productAlerts);
      });
  }

  /** Category */

  browseCategory() {
    this.categoryForm.controls['categorySearch'].valueChanges
      .pipe(debounceTime(1000), distinctUntilChanged())
      .subscribe((changes: any) => {
        if (this.pgService.isEmptyOrSpaces(changes)) {
          this.categoryForm.controls['categorySearchResult'].setValue([]);
        } else {
          // Request categories.
          lastValueFrom(this.getCategory(changes)).then((resp: any) => {
            //$('#browse-category').removeClass('query');
            if (resp.status == 200) {
              //$('#browse-category').removeClass('query');
              this.categoryForm.get('categorySearchResult')?.setValue(
                resp.details.map((category: any) => {
                  category.path = category.path.replace(
                    new RegExp('/', 'g'),
                    ' > '
                  );
                  return category;
                })
              );
            }
          });
        }
      });
  }

  selectCategory(c: any) {
    this.categoryForm.get('categorySelected')?.setValue(c);
    this.categoryForm.controls['lvlCategory'].setValue(c.parentId);

    // Get attributes by category
    const getDepAttri = this.getAttributes(
      '',
      this.categoryForm.value.categorySelected.level_category_id,
      'optionDetails,optionUnits'
    );
    const getRegions = this.sellerService.regions([
      { key: 'pagination', value: '-1' },
    ]);

    forkJoin([getDepAttri, getRegions]).subscribe((values: any[]) => {
      if (values[0] && values[0].status == 200) {
        this.moreDetails.attributes = values[0].details.data.map(
          (header: any) => {
            return {
              id: '-1',
              headerId: header.id,
              name: header.title,
              code: header.code,
              description: '',
              allowDetailCustomName: header.allow_dtls_custom_name,
              needDetailMapping: header.need_dtls_mapping,
              details: header.option_details,
              units: header.option_units ? header.option_units : [],
              value: this.createAttribute() as FormGroup,
            };
          }
        );
      }
      if (values[1] && values[1].status == 200) {
        this.currencyByRegions = values[1].details.data;
      }
      this.tabs.select(2);
    });
  }

  importCategory(data: any) {
    this.categoryForm.controls['categorySearch'].setValue('');
    this.categoryForm.controls['categorySearchResult'].setValue([]);
    this.categoryForm.controls['categorySelected'].setValue({ path: '' });
    this.categoryForm.controls['lvlCategory'].setValue(data.category);
    data.category.path = (<string>data.category.path).replace(
      new RegExp('/', 'g'),
      ' > '
    );
    this.categoryForm.controls['categorySelected'].setValue(data.category);
  }

  /** Vital Info */

  importVitalInfoForm(data: any) {
    this.vitalInfoForm.get('id')?.setValue(data.id, { emitEvent: false });
    this.vitalInfoForm
      .get('status')
      ?.setValue(data.biz_status, { emitEvent: false });
    this.vitalInfoForm.get('title')?.setValue(data.title, { emitEvent: false });
    this.vitalInfoForm.get('brand')?.setValue(data.brand, { emitEvent: false });
    this.vitalInfoForm
      .get('manufacturer')
      ?.setValue(data.manufacture, { emitEvent: false });
    this.vitalInfoForm
      .get('packType')
      ?.setValue(data.pack_type, { emitEvent: false });
    this.vitalInfoForm
      .get('currency')
      ?.setValue(data.currency, { emitEvent: false });
  }

  /** Offer */

  importOfferForm(data: any) {
    this.offerForm.controls['id'].setValue(data.id);
    this.offerForm.controls['sellerSku'].setValue(data.seller_sku);
    this.offerForm.controls['price'].setValue(
      this.pgService.round(data.buy_price)
    );
    this.offerForm.controls['sellingPrice'].setValue(data.selling_price + 0.0);
    this.offerForm.controls['quantity'].setValue(data.qty);
    this.offerForm.controls['dateRange'].setValue({
      start: this.pgService.dateFormat(data.start_at),
      end: this.pgService.dateFormat(data.expired_at),
    });
    this.offerForm.controls['condition'].setValue({
      id: data.fk_condition_id,
    });
  }

  /** Description */

  addFeatures(i: number, e: any) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      return;
    }
    let featuresLength = (<FormArray>this.descriptionForm.get('features'))
      .length;
    if (i == featuresLength - 1) {
      (<FormArray>this.descriptionForm.get('features')).push(
        new FormControl('')
      );
    }
  }

  removeLastFeatures() {
    let features: FormArray = <FormArray>this.descriptionForm.get('features');
    if (features.length - 2 > 0) features.removeAt(features.length - 2);
  }

  importDescription(data: any, variantId: string | null) {
    if (!data.variant_option1_hdr) {
      if (data.variants[0].features) {
        let features = this.descriptionForm.controls['features'] as FormArray;
        features.clear();
        for (let feature of data.variants[0].features) {
          features.push(new FormControl(feature));
        }
        features.push(new FormControl(''));
      }
      if (data.variants[0].prod_desc) {
        this.descriptionForm.controls['description'].setValue(
          data.variants[0].prod_desc
        );
      }
    }
  }

  /** Attributes */

  private createAttribute(attri?: any) {
    return this.fb.group({
      optionDetail: new FormControl(
        attri?.id ? { id: attri.fk_varopt_dtl_id } : null
      ),
      optionUnit: new FormControl(
        attri?.id ? { id: attri.fk_varopt_unit_id } : null
      ),
      value: new FormControl(attri?.id ? attri.attri_value : null),
    });
  }

  async importAttributes(data: any) {
    const attributes = await lastValueFrom(
      this.getAttributes(
        '',
        this.categoryForm.value.categorySelected.level_category_id,
        'optionDetails,optionUnits'
      )
    )
      .then((res: any) => {
        return res.status == 200 ? res : { data: [] };
      })
      .catch(() => {
        return { data: [] };
      });

    if (!data.fk_varopt_1_hdr_id) {
      this.moreDetails.attributes = data.variants[0].attributes.map(
        (attribute: any) => {
          const optionHeader = attributes.details.data.find((header: any) => {
            return header.id == attribute.fk_varopt_hdr_id;
          });
          return {
            id: attribute.id,
            headerId: attribute.fk_varopt_hdr_id,
            name: attribute.title,
            code: attribute.optionHeader?.code,
            description: attribute.optionHeader?.description,
            allowDetailCustomName: attribute.allow_dtls_custom_name,
            needDetailMapping: attribute.need_dtls_mapping,
            details: optionHeader ? optionHeader?.option_details : [],
            units: optionHeader ? optionHeader?.option_units : [],
            value: this.createAttribute(attribute) as FormGroup,
          } as MoreDetail;
        }
      );
    } else {
      this.moreDetails.attributes = attributes.details.data.map(
        (header: any) => {
          return {
            id: '-1',
            headerId: header.id,
            name: header.title,
            code: header.code,
            description: '',
            allowDetailCustomName: header.allow_dtls_custom_name,
            needDetailMapping: header.need_dtls_mapping,
            details: header.option_details,
            units: header.option_units ? header.option_units : [],

            value: this.createAttribute() as FormGroup,
          };
        }
      );
    }
  }

  /** Media */

  loadImage(e: Media, formControlName: string) {
    this.mediaForm.controls[formControlName].setValue(e);
  }

  /** Variants */

  private createVariantOption() {
    for (let i = 0; i < 3; i++) {
      this.options.push(
        new FormGroup({
          header: new FormControl(null),
          headerSearchValue: new FormControl(''),
          autoCompleteList: new FormControl([]),
          details: new FormControl([]),
          list: new FormArray([this.createVariantOptionItem(i)]),
        })
      );
    }
  }

  private createVariantOptionItem(
    optionOrder: number,
    name: string = '',
    id: number = this.pgService.randomInt(1, 1000)
  ) {
    let formGroup = this.fb.group({
      id: new FormControl(id),
      name: new FormControl(name),
      error: new FormControl({ isError: false, message: 'hello' }),
      optionOrder: new FormControl(optionOrder),
    });
    this.changeVariantOption(optionOrder, formGroup);
    return formGroup;
  }

  private createVariation(
    hdr1: any = null,
    title1: any = null,
    hdr2: any = null,
    title2: any = null,
    hdr3: any = null,
    title3: any = null
  ): FormGroup {
    let product = this.fb.group({
      formId: new FormControl(this.pgService.randomInt(1, 1000)),
      selected: new FormControl(false),
      edit: new FormControl(false),
      id: new FormControl('-1'),
      status: new FormControl(2),
      sellerSku: new FormControl(''),
      variantOptions: new FormArray([
        this.fb.group({
          header: new FormControl(hdr1),
          detail: new FormControl(''),
          inputRef: title1,
        }),
        this.fb.group({
          header: new FormControl(hdr2),
          detail: new FormControl(''),
          inputRef: title2,
        }),
        this.fb.group({
          header: new FormControl(hdr3),
          detail: new FormControl(''),
          inputRef: title3,
        }),
      ]),
      price: new FormControl(0),
      sellingPrice: new FormControl(0),
      quantity: new FormControl(0),
      dateRange: new FormControl({ start: new Date(), end: new Date() }),
      condition: new FormControl(),
      images: new FormArray([]),
      description: new FormControl(''),
      features: new FormArray([]),
      media_1_image: new FormControl(null),
      media_2_image: new FormControl(null),
      media_3_image: new FormControl(null),
      media_4_image: new FormControl(null),
      media_5_image: new FormControl(null),
      media_6_image: new FormControl(null),
      media_7_image: new FormControl(null),
      media_8_video: new FormControl(null),
      media_9_video: new FormControl(null),
    });
    return product;
  }

  selectVariants(operation: boolean) {
    let controls = (<FormArray>(
      this.productVariationForm.get('products')
    )).controls.filter((c) => {
      return c.get('status')?.value !== 4;
    });
    for (let c of controls as FormGroup[]) {
      c.controls['selected'].setValue(operation);
    }
  }

  replaceAllPrice(formControlName: string) {
    const value = this.filterControlForm.controls[formControlName].value;
    let controls = (<FormArray>this.productVariationForm.get('products'))
      .controls;
    for (let c of controls as FormGroup[]) {
      if (c.get('selected')?.value) c.get(formControlName)?.setValue(value);
    }
  }

  replaceAllDateRange() {
    const startDate = this.filterControlForm.get('startDate')?.value;
    const endDate = this.filterControlForm.get('endDate')?.value;
    let controls = (<FormArray>this.productVariationForm.controls['products'])
      .controls as FormGroup[];

    for (let c of controls) {
      if (c.value.selected) {
        c.controls['startDate'].setValue(startDate);
        c.controls['endDate'].setValue(endDate);
      }
    }
  }

  replaceAllCondition() {
    let controls = (<FormArray>this.productVariationForm.controls['products'])
      .controls as FormGroup[];
    for (let c of controls) {
      if (c.value.selected) {
        c.controls['condition'].setValue(
          this.filterControlForm.controls['condition'].value
        );
      }
    }
  }

  generateRandomSKUS() {
    let controls = (<FormArray>this.productVariationForm.controls['products'])
      .controls as FormGroup[];
    for (let c of controls) {
      if (c.value.selected)
        c.controls['sellerSku'].setValue(
          this.pgService.randomString(
            this.filterControlForm.value.randomIdLength
          )
        );
    }
  }

  selectedVariantOption(value: any, fg: any) {
    let option = {
      id: value.item.id,
      status: 2,
      biz_status: 2,
      title: value.item.name,
      allow_dtls_custom_name: true,
      need_dtls_mapping: true,
      details: undefined,
    };
    fg.get('header').setValue(option);
    lastValueFrom(this.getVariantOptionItems(option.id)).then((e: any) => {
      fg.get('details').setValue(e.details.data);
    });
    this.options.forEach((formGroup: any) => {
      formGroup.get('autoCompleteList').setValue([]);
    });
  }

  addVariantOption(
    optionIndex: number,
    optionInputIndex: number,
    option: any,
    event: any
  ) {
    if (event.keyCode == 13 || event.keyCode == 9) return;
    let opt = <FormArray>this.options[optionIndex].get('list');
    /** Add extra input box for next */
    if (optionInputIndex == opt.controls.length - 1) {
      if (option.get('name')?.value !== '') {
        opt.push(this.createVariantOptionItem(optionIndex));
      }
    }
  }

  removeVariantOption(optionIndex: number, optionInputIndex: number) {
    let productFormArray = <FormArray>this.productVariationForm.get('products');
    for (let i = productFormArray.controls.length - 1; i >= 0; i--) {
      const optionId = this.options[optionIndex].get(
        'list.' + optionInputIndex + '.id'
      )?.value;
      const id = productFormArray.controls[i].get(
        'variantOptions.' + optionIndex + '.inputRef.id'
      )?.value;
      const prodId = productFormArray.controls[i].get('id')?.value;
      if (id && optionId == id) {
        if (this.pgService.isEmptyID(prodId)) {
          productFormArray.removeAt(i);
        } else {
          productFormArray.controls[i].get('status')?.setValue(4);
        }
      }
    }

    (<FormArray>this.options[optionIndex].get('list')).removeAt(
      optionInputIndex
    );

    if (productFormArray.controls.length == 0) {
      this.variationForm.get('hasVariant')?.setValue(false);
    }
  }

  removeVariantOptionHeader(optionIndex: number) {
    let productFormArray = <FormArray>this.productVariationForm.get('products');
    let options = <FormArray>this.options[optionIndex].get('list');
    let indexZeroOptionId = options.controls[0].get('id')?.value;
    for (let i = productFormArray.controls.length - 1; i >= 0; i--) {
      const prodOptId = productFormArray.controls[i].get(
        'variantOptions.' + optionIndex + '.inputRef.id'
      )?.value;
      const id = productFormArray.controls[i].get('id')?.value;
      if (prodOptId !== indexZeroOptionId) {
        if (!this.pgService.isEmptyID(id)) {
          this.deletedProducts.set(id, productFormArray.controls[i]);
        }
        productFormArray.removeAt(i);
      } else {
        /** Swap options array of a product */
        let varOpts = <FormArray>(
          productFormArray.controls[i].get('variantOptions')
        );
        let removed = varOpts.controls[optionIndex] as FormGroup;

        if (optionIndex !== varOpts.controls.length - 1) {
          for (let ii = optionIndex; ii < varOpts.controls.length; ii++) {
            if (ii + 1 == varOpts.controls.length - 1) {
              /** if next block is not null */
              if (varOpts.controls[ii + 1].get('header')?.value) {
                varOpts.controls[ii] = varOpts.controls[ii + 1];
                varOpts.controls[ii + 1] = removed;
                varOpts.controls[ii + 1].get('header')?.setValue(null);
                varOpts.controls[ii + 1].get('detail')?.setValue('');
                (<FormGroup>varOpts.controls[ii + 1]).controls['inputRef'] =
                  null as any;
              } else {
                varOpts.controls[ii] = removed;
                (<FormGroup>varOpts.controls[ii]).controls['header'].setValue(
                  null
                );
                (<FormGroup>varOpts.controls[ii]).controls['detail'].setValue(
                  ''
                );
                (<FormGroup>varOpts.controls[ii]).controls['inputRef'] =
                  null as any;
              }
              break;
            } else {
              if (varOpts.controls[ii + 1].get('header')?.value) {
                varOpts.controls[ii] = varOpts.controls[ii + 1];
              }
            }
          }
        } else {
          (<FormGroup>varOpts.controls[optionIndex]).controls[
            'header'
          ].setValue(null);
          (<FormGroup>varOpts.controls[optionIndex]).controls[
            'detail'
          ].setValue('');
          (<FormGroup>varOpts.controls[optionIndex]).controls['inputRef'] =
            null as any;
        }
      }
    }
    /** Swap options array */
    let removed = this.options[optionIndex];

    if (optionIndex !== this.options.length - 1) {
      for (let ii = optionIndex; ii < this.options.length; ii++) {
        if (ii + 1 == this.options.length - 1) {
          /** if next block is not null */
          if (this.options[ii + 1].get('header').value) {
            this.options[ii] = this.options[ii + 1];
            /** set current order index */
            this.options[ii]
              .get('list')
              .controls.forEach((e: AbstractControl) => {
                e.get('optionOrder')?.setValue(ii);
              });
            this.options[ii + 1] = removed;
            this.options[ii + 1].get('header').setValue(null);
            this.options[ii + 1].get('headerSearchValue').setValue('');
            (<FormArray>this.options[ii + 1].get('list')).clear();
            (<FormArray>this.options[ii + 1].get('list')).push(
              this.createVariantOptionItem(ii + 1)
            );
          } else {
            /** if next block is null */
            /** clear currrent block */
            this.options[ii] = removed;
            this.options[ii].get('header').setValue(null);
            this.options[ii].get('headerSearchValue').setValue('');
            (<FormArray>this.options[ii].get('list')).clear();
            (<FormArray>this.options[ii].get('list')).push(
              this.createVariantOptionItem(ii)
            );
          }
          break;
        } else {
          if (this.options[ii + 1].get('header').value) {
            this.options[ii] = this.options[ii + 1];
            this.options[ii]
              .get('list')
              .controls.forEach((e: AbstractControl) => {
                e.get('optionOrder')?.setValue(ii);
              });
          }
        }
      }
    } else {
      this.options[optionIndex].get('header').setValue(null);
      this.options[optionIndex].get('headerSearchValue').setValue('');
      (<FormArray>this.options[optionIndex].get('list')).clear();
      (<FormArray>this.options[optionIndex].get('list')).push(
        this.createVariantOptionItem(optionIndex)
      );
    }
    /** check */
    const isLastOption = this.options.reduce(
      (previous: number, current: FormGroup) => {
        return previous + (current.get('header')?.value ? 1 : 0);
      },
      0
    );
    if (isLastOption == 0) {
      this.variationForm.get('hasVariant')?.setValue(false);
      (<FormArray>this.productVariationForm.get('products')).controls.forEach(
        (e) => {
          if (!this.pgService.isEmptyID(e.get('id')?.value)) {
            this.deletedProducts.set(e.get('id')?.value, e);
          }
        }
      );
      (<FormArray>this.productVariationForm.get('products')).clear();
    }
  }

  removeVariant(variant: AbstractControl, index: number) {
    let products = this.productVariationForm.controls['products'] as FormArray;
    let opt1 = <FormArray>this.options[0].controls['list'];
    let opt2 = <FormArray>this.options[1].controls['list'];
    let opt3 = <FormArray>this.options[2].controls['list'];
    let opt1Count = 0;
    let opt2Count = 0;
    let opt3Count = 0;
    const opt1Name = variant.get('variantOptions.0.inputRef.name')?.value;
    const opt2Name = variant.get('variantOptions.1.inputRef.name')?.value;
    const opt3Name = variant.get('variantOptions.2.inputRef.name')?.value;
    if (
      products.controls.filter((e) => {
        return e.get('status')?.value !== 4;
      }).length == 1
    ) {
      this.removeVariationsFromProduct();
      return;
    }

    if (!this.pgService.isEmptyID(variant.get('id')?.value)) {
      variant.get('status')?.setValue(4);
      // Object.keys((<FormGroup>variant).controls).forEach((key) => {
      //   if (key !== "selected" && key !== "variantOptions")
      //     (<FormGroup>variant).controls[key].disable();
      // });
    } else {
      products.removeAt(index);
    }

    for (let i = 0; i < products.controls.length; i++) {
      const prodOpt1Name = products.controls[i].get(
        'variantOptions.0.inputRef.name'
      )?.value;
      const prodOpt2Name = products.controls[i].get(
        'variantOptions.1.inputRef.name'
      )?.value;
      const prodOpt3Name = products.controls[i].get(
        'variantOptions.2.inputRef.name'
      )?.value;
      const status = products.controls[i].get('status')?.value;
      if (opt1Name && status !== 4 && opt1Name == prodOpt1Name) {
        opt1Count++;
      }
      if (opt2Name && status !== 4 && opt2Name == prodOpt2Name) {
        opt2Count++;
      }
      if (opt3Name && status !== 4 && opt3Name == prodOpt3Name) {
        opt3Count++;
      }
    }
    if (opt1Count == 0 && opt1Name) {
      const index = opt1.controls.findIndex((e) => {
        return e.get('name')?.value == opt1Name;
      });
      if (index !== -1) opt1.removeAt(index);
    }
    if (opt2Count == 0 && opt2Name) {
      const index = opt2.controls.findIndex((e) => {
        return e.get('name')?.value == opt2Name;
      });
      if (index !== -1) opt2.removeAt(index);
    }
    if (opt3Count == 0 && opt3Name) {
      const index = opt3.controls.findIndex((e) => {
        return e.get('name')?.value == opt3Name;
      });
      if (index !== -1) opt3.removeAt(index);
    }
  }

  restoreVariant(variant: any) {
    const opt1Name = variant.get('variantOptions.0.inputRef.name')?.value;
    const opt2Name = variant.get('variantOptions.1.inputRef.name')?.value;
    const opt3Name = variant.get('variantOptions.2.inputRef.name')?.value;
    let opt1 = this.options[0].get('list');
    let opt2 = this.options[1].get('list');
    let opt3 = this.options[2].get('list');
    variant.controls['status'].setValue(2);
    if (opt1Name) {
      const index = opt1.controls.findIndex((e: any) => {
        return e.get('name')?.value == opt1Name;
      });
      if (index == -1) {
        let prodFormGroup = <FormGroup>variant.get('variantOptions.0');
        opt1.controls.unshift(prodFormGroup.controls['inputRef']);
      }
    }
    if (opt2Name) {
      const index = opt2.controls.findIndex((e: any) => {
        return e.get('name')?.value == opt2Name;
      });
      if (index == -1) {
        let prodFormGroup = <FormGroup>variant.get('variantOptions.1');
        opt2.controls.unshift(prodFormGroup.controls['inputRef']);
      }
    }
    if (opt3Name) {
      const index = opt3.controls.findIndex((e: any) => {
        return e.get('name')?.value == opt3Name;
      });
      if (index == -1) {
        let prodFormGroup = <FormGroup>variant.get('variantOptions.2');
        opt3.controls.unshift(prodFormGroup.controls['inputRef']);
      }
    }
  }

  async removeVariationsFromProduct() {
    const result = await this.popup.showConfirmModal({
      header: 'Do you want to remove all variants?',
      btns: {
        cancel: '',
        confirm: '',
      },
    });
    if (result) {
      this.variationForm.get('hasVariant')?.setValue(false);
      (<FormArray>this.productVariationForm.get('products')).controls.forEach(
        (e) => {
          if (!this.pgService.isEmptyID(e.get('id')?.value)) {
            this.deletedProducts.set(e.get('id')?.value, e);
          }
        }
      );
      (<FormArray>this.productVariationForm.get('products')).clear();
    }
  }

  applyVariantOption(
    dtl1: AbstractControl[],
    dtl2: AbstractControl[],
    dtl3: AbstractControl[]
  ) {
    let productFormArray = <FormArray>(
      this.productVariationForm.controls['products']
    );

    for (let a = 0; a < dtl1.length; a++) {
      if (dtl2.length != 0) {
        for (let b = 0; b < dtl2.length; b++) {
          if (dtl3.length != 0) {
            for (let c = 0; c < dtl3.length; c++) {
              const pfIndex = -1;
              if (pfIndex !== -1) {
                (productFormArray.controls[pfIndex] as FormGroup).controls[
                  'status'
                ].setValue(2);
              } else {
                let variant = this.createVariation(
                  this.options[0].get('header').value,
                  dtl1[a],
                  this.options[1].get('header').value,
                  dtl2[b],
                  this.options[2].get('header').value,
                  dtl3[c]
                );
                variant = this.importPricing(variant);
                //variant = this.convertIntoVariant(variant, a, b, c);
                productFormArray.push(variant);
              }
            }
          } else {
            const pfIndex = -1;
            if (pfIndex !== -1) {
              (productFormArray.controls[pfIndex] as FormGroup).controls[
                'status'
              ].setValue(2);
            } else {
              let variant = this.createVariation(
                this.options[0].get('header').value,
                dtl1[a],
                this.options[1].get('header').value,
                dtl2[b]
              );
              variant = this.importPricing(variant);
              //variant = this.convertIntoVariant(variant, a, b);
              productFormArray.push(variant);
            }
          }
        }
      } else {
        const pfIndex = -1;
        if (pfIndex !== -1) {
          (productFormArray.controls[pfIndex] as FormGroup).controls[
            'status'
          ].setValue(2);
        } else {
          let variant = this.createVariation(
            this.options[0].get('header').value,
            dtl1[a]
          );
          variant = this.importPricing(variant);
          //variant = this.convertIntoVariant(variant, a);
          productFormArray.push(variant);
        }
      }
    }
  }

  applyVariantOptionIndex0(optionDtl: AbstractControl, optionIndex: number) {
    let productFormArray = <FormArray>this.productVariationForm.get('products');
    for (let control of productFormArray.controls as FormGroup[]) {
      let prodFormGroup = <FormGroup>(
        control.get('variantOptions.' + optionIndex)
      );
      prodFormGroup.controls['inputRef'] = optionDtl;
      prodFormGroup.controls['header'].setValue(
        this.options[optionIndex].controls['header'].value
      );
    }
  }

  importPricing(variant: FormGroup): FormGroup {
    variant.controls['price'].setValue(this.offerForm.value.price);
    variant.controls['sellingPrice'].setValue(
      this.offerForm.value.sellingPrice
    );
    variant.controls['quantity'].setValue(this.offerForm.value.quantity);
    return variant;
  }

  changeVariantOption(optionIndex: number, fg: FormGroup) {
    fg.controls['name'].valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(500))
      .subscribe((changes: any) => {
        if (!this.pgService.isEmptyOrSpaces(changes)) {
          optionIndex = fg.get('optionOrder')?.value;
          let duplicate = 0;
          let optionCount = 0;
          for (let prod of this.productVariationControls) {
            const title = prod.get(
              'variantOptions.' + optionIndex + '.inputRef.name'
            )?.value;

            const id = prod.get(
              'variantOptions.' + optionIndex + '.inputRef.id'
            )?.value;
            if (title && id !== fg.get('id')?.value && title === changes) {
              duplicate++;
            }
            if (fg.get('id')?.value == id) optionCount++;
          }
          /** Create Duplicate alert in removed products */
          if (duplicate > 0) {
            this.alertVariantOptionError(fg, changes);
            fg.controls['name'].setValue(changes.slice(0, -1), {
              emitEvent: false,
            });
            //return;
          }
          if (optionCount > 0) return;

          /** Add line to products array */
          if (optionIndex == 0) {
            let firstThemeValue = [fg];
            let secondThemeValue = this.options[1]
              .get('list')
              .controls.filter((v: any) => {
                return !this.pgService.isEmptyOrSpaces(v.get('name')?.value);
              });
            let thirdThemeValue = this.options[2]
              .get('list')
              .controls.filter((v: any) => {
                return !this.pgService.isEmptyOrSpaces(v.get('name')?.value);
              });
            this.applyVariantOption(
              firstThemeValue,
              secondThemeValue,
              thirdThemeValue
            );
          } else if (optionIndex == 1) {
            /** Add line to products array */
            /** Check Option index if 0 just add it to product */
            if (this.options[1].get('list').controls.indexOf(fg) == 0) {
              //this.option2 = this.variationForm.controls["secondTheme"].value;
              this.applyVariantOptionIndex0(fg, optionIndex);
            } else {
              let firstThemeValue = this.options[0]
                .get('list')
                .controls.filter((v: any) => {
                  return !this.pgService.isEmptyOrSpaces(v.get('name')?.value);
                });
              let secondThemeValue = [fg];
              let thirdThemeValue = this.options[2]
                .get('list')
                .controls.filter((v: any) => {
                  return !this.pgService.isEmptyOrSpaces(v.get('name')?.value);
                });
              this.applyVariantOption(
                firstThemeValue,
                secondThemeValue,
                thirdThemeValue
              );
            }
          } else {
            /** Add line to products array */
            /** Check Option index if 0 just add it to product */
            if (this.options[2].get('list').controls.indexOf(fg) == 0) {
              //this.option2 = this.variationForm.controls["secondTheme"].value;
              this.applyVariantOptionIndex0(fg, optionIndex);
            } else {
              let firstThemeValue = this.options[0]
                .get('list')
                .controls.filter((v: any) => {
                  return !this.pgService.isEmptyOrSpaces(v.get('name')?.value);
                });
              let secondThemeValue = this.options[1]
                .get('list')
                .controls.filter((v: any) => {
                  return !this.pgService.isEmptyOrSpaces(v.get('name')?.value);
                });
              let thirdThemeValue = [fg];
              this.applyVariantOption(
                firstThemeValue,
                secondThemeValue,
                thirdThemeValue
              );
            }
          }
        }
      });
  }

  alertVariantOptionError(
    variantOptionItem: AbstractControl<FormControl>,
    title: string
  ) {
    let error: any = variantOptionItem.get('error')?.value;
    error.isError = true;
    error.message = "You've already use the option value " + title;

    setTimeout(() => {
      error.isError = false;
      error.message = '';
    }, 1500);
  }

  async importVariations(data: any, variantId: string | null) {
    let optionSubscriptions: Observable<Object | null>[] = [];

    /** Has Variant */
    if (data.variant_option1_hdr) {
      this.variationForm.controls['hasVariant'].setValue(true);

      for (let i = 0; i < this.options.length; i++) {
        let optionHeader = data['variant_option' + (i + 1) + '_hdr'];

        if (optionHeader) {
          optionSubscriptions.push(this.getVariantOptionItems(optionHeader.id));

          let optionInputList = <FormArray>this.options[i].get('list');
          let optionEmptyInput = optionInputList.controls[0];
          this.options[i].get('header').setValue(optionHeader); //Set global option 1.

          this.options[i]
            .get('headerSearchValue')
            .setValue(optionHeader, { emitEvent: false });

          optionInputList.clear(); //Clear the array
          optionHeader.details.forEach((detail: any) => {
            optionInputList.push(
              this.createVariantOptionItem(i, detail.var_title)
            );
          });
          optionInputList.push(optionEmptyInput);
        }
      }
      if (data.variants) {
        let productFormArray = <FormArray>(
          this.productVariationForm.controls['products']
        );
        productFormArray.clear();

        for (let variant of data.variants) {
          let product: FormGroup = this.createVariation();
          product.controls['id'].setValue(variant.id);
          (<FormArray>product.controls['variantOptions']).controls.forEach(
            (e: any, i: number) => {
              e.get('detail').setValue(
                variant['fk_varopt_' + (i + 1) + '_dtl_id']
                  ? { id: variant['fk_varopt_' + (i + 1) + '_dtl_id'] }
                  : null
              );
              e.get('header').setValue(this.options[i].get('header')?.value);
            }
          );

          product.controls['condition'].setValue({
            id: variant.fk_condition_id,
          });
          product.controls['price'].setValue(variant.buy_price);
          product.controls['sellingPrice'].setValue(variant.selling_price);
          product.controls['quantity'].setValue(variant.qty);
          product.controls['sellerSku'].setValue(variant.seller_sku);
          product.controls['dateRange'].setValue({
            start: this.pgService.dateFormat(variant.start_at),
            end: this.pgService.dateFormat(variant.expired_at),
          });
          product.controls['media_1_image'].setValue(variant.media_1_image);
          product.controls['media_2_image'].setValue(variant.media_2_image);
          product.controls['media_3_image'].setValue(variant.media_3_image);
          product.controls['media_4_image'].setValue(variant.media_4_image);
          product.controls['media_5_image'].setValue(variant.media_5_image);
          product.controls['media_6_image'].setValue(variant.media_6_image);
          product.controls['media_7_image'].setValue(variant.media_7_image);
          product.controls['media_8_video'].setValue(variant.media_8_video);
          product.controls['media_9_video'].setValue(variant.media_9_video);
          for (let i = 0; i < this.options.length; i++) {
            const index = this.options[i]
              .get('list')
              .controls.findIndex((e: any) => {
                return (
                  e.controls['name'].value ==
                  variant['var_' + (i + 1) + '_title']
                );
              });
            if (index != -1) {
              (<FormGroup>product.get('variantOptions.' + i)).controls[
                'inputRef'
              ] = this.options[i].get('list').controls[index];
            }
          }
          productFormArray.push(product);
        }
      }
    } else {
      /** No variant */
      this.importOfferForm(data.variants[0]);
      /** Import Media */
      this.mediaForm.controls['media_1'].setValue(
        data.variants[0].media_1_image
      );
      this.mediaForm.controls['media_2'].setValue(
        data.variants[0].media_2_image
      );
      this.mediaForm.controls['media_3'].setValue(
        data.variants[0].media_3_image
      );
      this.mediaForm.controls['media_4'].setValue(
        data.variants[0].media_4_image
      );
      this.mediaForm.controls['media_5'].setValue(
        data.variants[0].media_5_image
      );
      this.mediaForm.controls['media_6'].setValue(
        data.variants[0].media_6_image
      );
      this.mediaForm.controls['media_7'].setValue(
        data.variants[0].media_7_image
      );
      this.mediaForm.controls['media_8'].setValue(
        data.variants[0].media_8_video
      );
      this.mediaForm.controls['media_9'].setValue(
        data.variants[0].media_9_video
      );
    }

    //fockjoin
    return lastValueFrom(forkJoin(optionSubscriptions))
      .then((result: any) => {
        this.options[0].get('details').setValue(result[0].details.data);
        this.options[1].get('details').setValue(result[1].details.data);
        this.options[2].get('details').setValue(result[2].details.data);
      })
      .catch((e) => null);
  }

  /** Http */

  getCategory(searchNames: string) {
    let param = new HttpParams();
    param = param.set('title', searchNames);
    return this.http.GET('category-leaves', param);
  }

  getVariantOptionItems(headerId: string) {
    return this.http.GET(`variant-options/headers/${headerId}/details`);
  }

  getAttributes(
    optionName: string,
    categoryId: string,
    relationships: string = ''
  ) {
    let httparam = new HttpParams();
    httparam = httparam.append('title', optionName);
    httparam = httparam.append('relationships', relationships);
    return this.http.GET(`categories/${categoryId}/attributes`, httparam);
  }

  getProductById(id: string, variantId: string | null) {
    let httpParam = new HttpParams();
    httpParam = httpParam.set(
      'relationships',
      'variants,myBrand,category,packType,currency,variantOption1Hdr,variantOption2Hdr,variantOption3Hdr'
    );
    httpParam = httpParam.set(
      'variants',
      'media_1_image,media_2_image,media_3_image,media_4_image,media_5_image,media_6_image,media_7_image,media_8_video,media_9_video'
    );
    return this.http.GET(`products/${id}`, httpParam);
  }

  /** Submit ==================================================================================*/

  submit() {
    let param: any = {
      biz_status: this.vitalInfoForm.value.status,
      title: this.vitalInfoForm.value.title,
      manufacture: this.vitalInfoForm.value.manufacturer,
      brand: this.vitalInfoForm.value.brand,
      package_qty: 0,
      fk_brand_id: this.authService.user.brand.id,
      fk_category_id: this.categoryForm.value.categorySelected?.id,
      fk_packtype_id: this.vitalInfoForm.value.packType?.id,
      fk_prod_group_id: null,
      fk_currency_id: this.vitalInfoForm.value.currency?.id,
      hasVariant: this.variationForm.value.hasVariant,
      variants: [],
    };

    // Product doesn't have variations 
    if (!param.hasVariant) {

      //check validation
      if(!this.vitalInfoForm.valid ) {
        this.popup.showTost('Invalid request!');
        return;
      }
      let vari = this.exportVariations(this.offerForm, param.hasVariant);

      try {
        vari.features = this.descriptionForm.value.features.filter((e: any) => {
          return !this.pgService.isEmptyOrSpaces(e);
        });
        vari.prod_desc = this.descriptionForm.value.description;
      } catch (e) {
        vari.features = [];
        alert('error add features');
      }
      vari.attributes = this.exportAttributes();
      param.variants = [vari];
    } else {

      // Check variations validation
      if( !this.vitalInfoForm.valid || !this.productVariationForm.valid) {
        this.popup.showTost('Invalid request!');
        return;
      }

      param.fk_varopt_1_hdr_id = this.options[0].value.header?.id;
      param.fk_varopt_2_hdr_id = this.options[1].value.header?.id;
      param.fk_varopt_3_hdr_id = this.options[2].value.header?.id;
      for (let fg of this.productVariationControls) {
        param.variants.push(this.exportVariations(fg, param.hasVariant));
      }
      if (this.product && !this.product.fk_varopt_1_hdr_id) {
        let variant = { ...this.product.variants[0] };
        variant.biz_status = 4;
        param.variants.push(variant);
      }
    }
    /** Deleted products import */
    for (const [key, value] of this.deletedProducts.entries()) {
      let delProd = this.exportVariations(value, param.hasVariant);
      delProd.biz_status = 4;
      param.variants.push(delProd);
    }

    const result = (e: any) => {
      if (e.status == 200) {
        this.popup.showTost('Success');
      } else {
        this.popup.showTost(e.message);
        console.log(e);
      }
    };

    if (this.vitalInfoForm.value.id) {
      param.id = this.vitalInfoForm.value.id;

      lastValueFrom(
        this.http.PUT(`products/${this.vitalInfoForm.value.id}`, param)
      ).then(result, (error) => {
        console.log(error);

        //this.popup.alert('Cant connect to server!');
      });
    } else {
      lastValueFrom(this.http.POST('products', param)).then(result, () => {
        //this.popup.alert('Cant connect to server!');
      });
    }
  }

  exportVariations(variationFg: any, hasVariant: boolean) {
    return {
      biz_status: variationFg.get('status')?.value,
      seller_sku: variationFg.get('sellerSku')?.value,
      fk_varopt_1_hdr_id: hasVariant
        ? variationFg.get('variantOptions.0.header').value?.id
        : null,
      fk_varopt_1_dtl_id: hasVariant
        ? variationFg.get('variantOptions.0.detail').value?.id
        : null,
      var_1_title: hasVariant
        ? variationFg.get('variantOptions.0.inputRef.name')?.value
        : null,
      fk_varopt_2_hdr_id: hasVariant
        ? variationFg.get('variantOptions.1.header').value?.id
        : null,
      fk_varopt_2_dtl_id: hasVariant
        ? variationFg.get('variantOptions.1.detail').value?.id
        : null,
      var_2_title: hasVariant
        ? variationFg.get('variantOptions.1.inputRef.name')?.value
        : null,
      fk_varopt_3_hdr_id: hasVariant
        ? variationFg.get('variantOptions.2.header').value?.id
        : null,
      fk_varopt_3_dtl_id: hasVariant
        ? variationFg.get('variantOptions.2.detail').value?.id
        : null,
      var_3_title: hasVariant
        ? variationFg.get('variantOptions.2.inputRef.name')?.value
        : null,
      buy_price: this.pgService.safeNum(variationFg.controls['price'].value),
      selling_price: this.pgService.safeNum(
        variationFg.controls['sellingPrice'].value
      ),
      qty: this.pgService.safeNum(variationFg.controls['quantity'].value),
      condition_desc: '',
      start_at: this.pgService.dateTransform(
        variationFg.get('dateRange')?.value?.start
      ),
      expired_at: this.pgService.dateTransform(
        variationFg.get('dateRange')?.value?.end
      ),
      fk_condition_id: variationFg.get('condition')?.value?.id,
      prod_desc: null,
      features: null,
      id: variationFg.value.id,
      media_1_image:
        this.offerForm.value.id === variationFg.value.id
          ? this.mediaForm.value.media_1?.id ?? null
          : variationFg.value.media_1_image?.id ?? null,
      media_2_image:
        this.offerForm.value.id === variationFg.value.id
          ? this.mediaForm.value.media_2?.id ?? null
          : variationFg.value.media_2_image?.id ?? null,
      media_3_image:
        this.offerForm.value.id === variationFg.value.id
          ? this.mediaForm.value.media_3?.id ?? null
          : variationFg.value.media_3_image?.id ?? null,
      media_4_image:
        this.offerForm.value.id === variationFg.value.id
          ? this.mediaForm.value.media_4?.id ?? null
          : variationFg.value.media_4_image?.id ?? null,
      media_5_image:
        this.offerForm.value.id === variationFg.value.id
          ? this.mediaForm.value.media_5?.id ?? null
          : variationFg.value.media_5_image?.id ?? null,
      media_6_image:
        this.offerForm.value.id === variationFg.value.id
          ? this.mediaForm.value.media_6?.id ?? null
          : variationFg.value.media_6_image?.id ?? null,
      media_7_image:
        this.offerForm.value.id === variationFg.value.id
          ? this.mediaForm.value.media_7?.id ?? null
          : variationFg.value.media_7_image?.id ?? null,
      media_8_video:
        this.offerForm.value.id === variationFg.value.id
          ? this.mediaForm.value.media_8?.id ?? null
          : variationFg.value.media_8_video?.id ?? null,
      media_9_video:
        this.offerForm.value.id === variationFg.value.id
          ? this.mediaForm.value.media_9?.id ?? null
          : variationFg.value.media_9_video?.id ?? null,
    } as any;
  }

  exportAttributes(): any[] {
    let attri: any[] = [];
    this.moreDetails.attributes
      .filter((e: any) => {
        if (
          e.allowDetailCustomName &&
          this.pgService.isEmptyOrSpaces(e.value.controls['value'].value)
        ) {
          return false;
        }
        if (
          e.needDetailMapping &&
          e.value.controls['optionDetail'].value == null
        ) {
          return false;
        }
        if (
          e.units.length != 0 &&
          e.value.controls['optionUnit'].value == null
        ) {
          return false;
        }
        return true;
      })
      .forEach((e) => {
        attri.push({
          id: e.id,
          fk_varopt_hdr_id: e.headerId,
          fk_varopt_dtl_id: e.value.controls['optionDetail'].value?.id,
          fk_varopt_unit_id: e.value.controls['optionUnit'].value?.id,
          value: e.value.controls['value'].value,
        });
      });
    return attri;
  }

  async importProduct(productId: any, variantId: any) {
    let loading = await this.popup.showLoading('please wait').then((e: any) => {
      return e;
    });
    loading.present();
    //this.pageControl.pageStatus = 0;

    const product = await lastValueFrom(
      this.getProductById(productId, variantId)
    )
      .then((result: any) => {
        return result.status == 200 ? result.details : null;
      })
      .catch(() => {
        return null;
      });
    this.product = product;
    this.importVitalInfoForm(product);
    this.importCategory(product);
    this.importAttributes(product);
    this.importDescription(product, variantId);
    await this.importVariations(product, variantId);
    this.identifyProductStatus();
    loading.dismiss();
  }

  /* Utility */
  compare(a: any, b: any) {
    if (a && b) return a.id.toString() === b.id.toString();
    else return false;
  }

  compareRandomSelect(a: number, b: number) {
    return a == b;
  }

  convertDecimal(el: any) {
    if (/^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$/.test(el.target.value)) {
      el.target.value = parseFloat(el.target.value).toFixed(this.decPlace);
    } else {
      el.target.value = '0.00';
    }
  }

  calMarginAndProfit() {
    const result = this.sellerService.marginPercentage(
      this.offerForm.value.sellingPrice,
      this.offerForm.value.price.value
    );
    this.profit = result[0];
    this.marginPercentage = result[1];
  }

  datePickerSelected(value: any, start: AbstractControl, end: AbstractControl) {
    start.setValue(value.start);
    end.setValue(value.end);
  }

  searchOptions = (text$: Observable<string>) =>
    text$.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap((changes) =>
        this.getAttributes(
          changes,
          this.categoryForm.value.categorySelected.level_category_id
        ).pipe(
          map((values: any) => {
            if (values.status == 200) {
              return values.details.data;
            } else {
              return [];
            }
          })
        )
      )
    );

  formatter = (x: { id: string; title: string }) => x.title;

  identifyProductStatus() {
    if (this.vitalInfoForm.get('status')?.value == BizStatus.DEF) {
      this._productAlerts.set('def', ALERTS['def']);
    }
    this.productAlertsController.next(this._productAlerts);
  }
}
