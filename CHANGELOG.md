# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [3.1.2](https://github.com/ecomplus/storage-api/compare/v3.1.1...v3.1.2) (2021-06-30)


### Bug Fixes

* **upload:** may respond even when no all optimizations done but uploaded ([1c8d070](https://github.com/ecomplus/storage-api/commit/1c8d070839878325b5c458ccb674a8b5ef57ec9a))

### [3.1.1](https://github.com/ecomplus/storage-api/compare/v3.1.0...v3.1.1) (2021-06-30)


### Bug Fixes

* **error-response:** better telling upload error with max file size ([8effd1f](https://github.com/ecomplus/storage-api/commit/8effd1ffb77ab991a6fd5d49fc77c3168fb60bed))

## [3.1.0](https://github.com/ecomplus/storage-api/compare/v3.0.4...v3.1.0) (2020-12-16)


### Features

* **cdn-host:** optional additional cdn host to optimized images ([5131613](https://github.com/ecomplus/storage-api/commit/513161350c73d6c5b94c16a3f72f070cfb2db8f0))


### Bug Fixes

* **web:** fix adding store id prefix to s3 key params ([ff4d63a](https://github.com/ecomplus/storage-api/commit/ff4d63a2000204a37d46aa3890d9207a4877c420))

### [3.0.4](https://github.com/ecomplus/storage-api/compare/v3.0.3...v3.0.4) (2020-12-15)


### Bug Fixes

* **web:** ensure method bucket is preserved on params (object changed by reference) ([ea57c79](https://github.com/ecomplus/storage-api/commit/ea57c79bb701c27b0ce1910622820ab8734bb894))
* **web:** ensure passing 'storeId' on s3 run method from exposed api ([390e394](https://github.com/ecomplus/storage-api/commit/390e394d015929e7a6a8282610d9e9a84ae2ec70))

### [3.0.3](https://github.com/ecomplus/storage-api/compare/v3.0.2...v3.0.3) (2020-12-14)


### Bug Fixes

* **web:** fix getting promise from 'runMethod' ([296e541](https://github.com/ecomplus/storage-api/commit/296e5419efaa90b272fc8e3004ba83c0f568caad))

### [3.0.2](https://github.com/ecomplus/storage-api/compare/v3.0.1...v3.0.2) (2020-12-14)


### Bug Fixes

* **web:** force each space bucket on run method for all ([e4e56e8](https://github.com/ecomplus/storage-api/commit/e4e56e82bfdf3b5164b11ef7ae70d60723706afa))

### [3.0.1](https://github.com/ecomplus/storage-api/compare/v3.0.0...v3.0.1) (2020-12-14)


### Bug Fixes

* **aws-client:** must pass s3 client to nested methods (changed 'this') ([1b7748d](https://github.com/ecomplus/storage-api/commit/1b7748d2b4b026770601f6bc6a37feee3ede756a))

## [3.0.0](https://github.com/ecomplus/storage-api/compare/v2.0.4...v3.0.0) (2020-12-14)


### ⚠ BREAKING CHANGES

* **web:** setup endoint removed (no more creating buckets), keys renamed
* **config-sample:** doSpace config object edited

### Bug Fixes

* **web:** storage object key must keep @ prefix ([3c4bc70](https://github.com/ecomplus/storage-api/commit/3c4bc700959a375ded1aead2f5c67a50d8916881))


* **config-sample:** refactors for multiple datacenters ([b75f238](https://github.com/ecomplus/storage-api/commit/b75f2380a5d63b12fa07176354f67afc708526d2))
* **web:** refactor all to handle multiple datacenters and fixed buckets ([5cc4d16](https://github.com/ecomplus/storage-api/commit/5cc4d160d349e718c0d23f624284161e780fcd99))

### [2.0.4](https://github.com/ecomclub/storage-api/compare/v2.0.3...v2.0.4) (2020-02-21)


### Bug Fixes

* **cloudinary:** destroy with delay after upload to save storage quota ([851ab45](https://github.com/ecomclub/storage-api/commit/851ab45238c10d2264e1dd3d7845c79ffc8b30b0))
* **cloudinary:** for webp, set quality 80 to ensure lossy enabled ([81a3eac](https://github.com/ecomclub/storage-api/commit/81a3eacb76c6d2201fd8add7e55bf8405ea493fb))
* **upload:** fix getting url prop from smaller picture obj ([3731bce](https://github.com/ecomclub/storage-api/commit/3731bce1374f9df0c7d5395367047cea81901e73))
* **upload:** fix working with picture object to get smaller one ([4887fe8](https://github.com/ecomclub/storage-api/commit/4887fe86b8506f4e888fc891eafdb4f05cbf78e9))
* **upload:** start manipulation always with original, check lower bytes ([e39e7ef](https://github.com/ecomclub/storage-api/commit/e39e7efa36889f7d605d15c0e24a0768fb157276))

### [2.0.3](https://github.com/ecomclub/storage-api/compare/v2.0.2...v2.0.3) (2020-02-21)


### Bug Fixes

* **cloudinary:** hardset webp format when compression enabled ([01db968](https://github.com/ecomclub/storage-api/commit/01db96887c3a45223312b3ed8952a6ad326f2592))

### [2.0.2](https://github.com/ecomclub/storage-api/compare/v2.0.1...v2.0.2) (2020-02-21)


### Bug Fixes

* **upload:** fix handling resolve (set url) after s3 put ([e9c5828](https://github.com/ecomclub/storage-api/commit/e9c5828ab0a1c54ef937b94464e234bf4896d9e2))

### [2.0.1](https://github.com/ecomclub/storage-api/compare/v2.0.0...v2.0.1) (2020-02-21)


### Bug Fixes

* **lib:** rename client file for cloudinary ([ba03e8e](https://github.com/ecomclub/storage-api/commit/ba03e8e560a50b6fe4470414b73cafb8eae33505))

## [2.0.0](https://github.com/ecomclub/storage-api/compare/v1.2.1...v2.0.0) (2020-02-20)


### ⚠ BREAKING CHANGES

* **lib:** changing manipulation service

### Features

* **web:** update to use cloudinary (best fit format) in place of kraken ([a97872c](https://github.com/ecomclub/storage-api/commit/a97872ce89abd96590c1bcb88ed9ebae4bbb059e))


* **lib:** replacing kraken with cloudinary ([1f856be](https://github.com/ecomclub/storage-api/commit/1f856be81f173520a0dd0dc78632f89f6607feca))

### [1.2.1](https://github.com/ecomclub/storage-api/compare/v1.2.0...v1.2.1) (2020-02-20)


### Bug Fixes

* **web:** no auths middlewares for kraken callback url ([b495fce](https://github.com/ecomclub/storage-api/commit/b495fcefec6c480e1d6b5a907b4cc60b80dddbe4))

## [1.2.0](https://github.com/ecomclub/storage-api/compare/v1.1.0...v1.2.0) (2020-02-20)


### Features

* **web:** handling kraken optimization with callback url ([a13f727](https://github.com/ecomclub/storage-api/commit/a13f727e1b14f460bb883b2218ff5d2b7ebb3de2))


### Bug Fixes

* **kraken:** returning kraken req id if callback url ([ca3f806](https://github.com/ecomclub/storage-api/commit/ca3f8063828d12e286c5676cf5a0200dc9941280))

## [1.1.0](https://github.com/ecomclub/storage-api/compare/v1.0.3...v1.1.0) (2020-02-20)


### Features

* **lib:** add download image handler, get image from kraken if wait opt ([31c64df](https://github.com/ecomclub/storage-api/commit/31c64df67ae78c9f537870b0dc162f94d01fa485))


### Bug Fixes

* **kraken:** making s3 integration optional ([95e2e70](https://github.com/ecomclub/storage-api/commit/95e2e7005364d6596ef5d0591e2b17f9433f5fd0))
* **web:** setup kraken without s3 (don't work for do spaces) ([4eeb045](https://github.com/ecomclub/storage-api/commit/4eeb04585cab0b97ef657ddd4ea5c940c363db6a))

### [1.0.3](https://github.com/ecomclub/storage-api/compare/v1.0.2...v1.0.3) (2020-02-20)


### Bug Fixes

* **web:** revert using kraken wait opts to integrate s3 ([c4b325e](https://github.com/ecomclub/storage-api/commit/c4b325eca31e341ec163c1db557933978b603086))

### [1.0.2](https://github.com/ecomclub/storage-api/compare/v1.0.1...v1.0.2) (2020-02-20)

### [1.0.1](https://github.com/ecomclub/storage-api/compare/v1.0.0...v1.0.1) (2020-02-20)


### Bug Fixes

* **kraken:** receive callback url as param, set 'callback_url' or 'wait' ([8fecfab](https://github.com/ecomclub/storage-api/commit/8fecfab748c2000609adc659cdd4730cf315d375))
* **web:** pass calback url to kraken handler ([c91b524](https://github.com/ecomclub/storage-api/commit/c91b52414c32be04d49fb6baa874292555487d99))

## 1.0.0 (2020-02-20)


### Features

* **kraken:** add webp compression ([d0011c3](https://github.com/ecomclub/storage-api/commit/d0011c32fc7e1533d7f8643a334c0a6f431e493e))
* **upload:** add cache control and handle convertion to webp ([7ef5a85](https://github.com/ecomclub/storage-api/commit/7ef5a8543edfbc0acb8a39ddaf72434ac236cf96))
* **upload:** optimze/save save fallback img (not webp) with middle size ([6181b2c](https://github.com/ecomclub/storage-api/commit/6181b2c798f90b622171aa21cc680cad04350f2a))
* supporting gif and bmp image types ([a9881de](https://github.com/ecomclub/storage-api/commit/a9881de79a30869c0401d332bdc5a7896854040d))


### Bug Fixes

* **img-optimization:** use always original image as base ([7952bb1](https://github.com/ecomclub/storage-api/commit/7952bb113b93a976c84515eb3062b940b9f03d3c))
* **kraken:** debug optim options, set request timeout ([ad01e99](https://github.com/ecomclub/storage-api/commit/ad01e99b7eeb42b2918cbc180e06a22abcc5ce38))
* **kraken:** fix handling request timeout and get image fallback ([3d05459](https://github.com/ecomclub/storage-api/commit/3d05459a76c697ddd59931eb59d51a835703de05))
* **kraken:** fix to handle webp compression ([718a77a](https://github.com/ecomclub/storage-api/commit/718a77a5c19821c82c8673bea11ff5b9ba41ce2a))
* **kraken:** force timeout with 20s ([7192e10](https://github.com/ecomclub/storage-api/commit/7192e1086856b02aa767c06820d5b4934643c851))
* **kraken:** handle webp compression only if not webp yet ([b5fc7d8](https://github.com/ecomclub/storage-api/commit/b5fc7d85e2257a2a2ec88c19ad17227b166a35c3))
* **kraken:** hardset webp/lossy options ([e699a3f](https://github.com/ecomclub/storage-api/commit/e699a3fd779822710ff9ae6c6bb8bb1807dee72f))
* **kraken:** must set opts object inside parse function ([fb884da](https://github.com/ecomclub/storage-api/commit/fb884daba9de1c682a9c1438fe3e453782fd8b16))
* **s3-put:** fix CacheControl param ([5d420aa](https://github.com/ecomclub/storage-api/commit/5d420aa0318e868d86908c186ecdba565c0b4acf))
* **upload:** back with .webp extension, use different size for fl img ([3cb4da4](https://github.com/ecomclub/storage-api/commit/3cb4da4b32ab74e40b2dc98f1f87d3c9ffb34c0f))
* **upload:** check data on callback function before handling put ([163d421](https://github.com/ecomclub/storage-api/commit/163d42134950817411b713af979659f7578831eb))
* **upload:** check isSavingFallback boolean to prevent duplicated response ([618ebac](https://github.com/ecomclub/storage-api/commit/618ebacf6864665150f5a92b4aba5f694efeb9d5))
* **upload:** delay to save webp fallback with middle size ([7dbf631](https://github.com/ecomclub/storage-api/commit/7dbf6318d08237a135ea4dcbb0aaf524f154a786))
* **upload:** edit new key (with label), fix handling picture objects ([b33d4d7](https://github.com/ecomclub/storage-api/commit/b33d4d77e621c10e637e360187d2aac52046517a))
* **upload:** fix key with .webp on first upload ([de925ef](https://github.com/ecomclub/storage-api/commit/de925ef72d5a536eccb29c0b02cc72a5a3e24958))
* **upload:** fix looping widths and web, count before checking length ([11431c6](https://github.com/ecomclub/storage-api/commit/11431c68aff0ea8cccf863b6251d2f7b1a365f78))
* **upload:** fix looping widths and webp variations ([8ec7989](https://github.com/ecomclub/storage-api/commit/8ec798919b77f7ea345b0bd7a6f162794ebe8905))
* **upload:** fix looping widths and webp variations ([ee78649](https://github.com/ecomclub/storage-api/commit/ee786498966c392a84a12aeb2cf6e6f8376d47e6))
* **upload:** fix picture labels from optims array ([035f06f](https://github.com/ecomclub/storage-api/commit/035f06f2e3f5a0bca31c87c7be57dec3d645527e))
* **upload:** fixes to handle last parse to flk image ([9a91b79](https://github.com/ecomclub/storage-api/commit/9a91b799df7ac2392bf3039a674efead1696822a))
* **upload:** keep original content type when saving webp fallback ([144f0da](https://github.com/ecomclub/storage-api/commit/144f0da9e0a34edfe41083757e687153762df4a8))
* **upload:** mark new upladed keys with 'v2-' prefix ([4b004b9](https://github.com/ecomclub/storage-api/commit/4b004b974f260b95a74515887405aefff130a757))
* **upload:** prefix for webp fallback image ([f7e2688](https://github.com/ecomclub/storage-api/commit/f7e2688f854a3e67f69e3030c43587b815a105c2))
* **upload:** reset isWebp to save fallback images ([865d2ac](https://github.com/ecomclub/storage-api/commit/865d2acea1c77deb99cc2643f8b1c977cbae114d))
* **upload:** stop hardsetting webp extension on s3 keys ([5099aac](https://github.com/ecomclub/storage-api/commit/5099aacde0010cf9c9b64cf0f04f9ffd61f37c7f))
* **upload:** using promise then instead of finally (no polyfill) ([b02f6eb](https://github.com/ecomclub/storage-api/commit/b02f6eb2ea8f83dfc3dd42e12e1a7bc237eb2402))
* **web:** update aws and kraken setup and upload function with new lib ([62a10fa](https://github.com/ecomclub/storage-api/commit/62a10fa95ad96fe4ba71be2cbe957702a4601898))
* error when kraken fails sending the s3 uri ([211aae3](https://github.com/ecomclub/storage-api/commit/211aae3d03179cd2c36e4a9852c3c1df9069c0dd))
* respond with error when kraken fails ([3b3b3ba](https://github.com/ecomclub/storage-api/commit/3b3b3ba8259742b6eb56ba6918e38c6f956c20a6))
* stop logging all kraken errors directly ([312b149](https://github.com/ecomclub/storage-api/commit/312b1496adb4ddcb0194f965ef2dc9a9381dcfa1))
