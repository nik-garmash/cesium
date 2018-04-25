define([
        '../Core/ComponentDatatype',
        '../Core/defined',
        '../Core/IndexDatatype',
        '../Core/RuntimeError',
        './createTaskProcessorWorker'
    ], function(
        ComponentDatatype,
        defined,
        IndexDatatype,
        RuntimeError,
        createTaskProcessorWorker) {
    'use strict';

    var draco;
    var dracoDecoder;

    function decodeIndexArray(dracoGeometry) {
        var numPoints = dracoGeometry.num_points();
        var numFaces = dracoGeometry.num_faces();
        var faceIndices = new draco.DracoInt32Array();
        var numIndices = numFaces * 3;
        var indexArray = IndexDatatype.createTypedArray(numPoints, numIndices);

        var offset = 0;
        for (var i = 0; i < numFaces; ++i) {
            dracoDecoder.GetFaceFromMesh(dracoGeometry, i, faceIndices);

            indexArray[offset + 0] = faceIndices.GetValue(0);
            indexArray[offset + 1] = faceIndices.GetValue(1);
            indexArray[offset + 2] = faceIndices.GetValue(2);
            offset += 3;
        }

        draco.destroy(faceIndices);

        return {
            typedArray : indexArray,
            numberOfIndices : numIndices
        };
    }

    function decodeQuantizedDracoTypedArray(dracoGeometry, attribute, quantization, vertexArrayLength) {
        var vertexArray = new Uint16Array(vertexArrayLength);
        var attributeData = new draco.DracoUInt16Array();
        dracoDecoder.GetAttributeUInt16ForAllPoints(dracoGeometry, attribute, attributeData);

        for (var i = 0; i < vertexArrayLength; ++i) {
            vertexArray[i] = attributeData.GetValue(i);
        }

        draco.destroy(attributeData);
        return vertexArray;
    }

    function decodeDracoTypedArray(dracoGeometry, attribute, vertexArrayLength) {
        var vertexArray;
        var attributeData;

        // Some attribute types are casted down to 32 bit since Draco only returns 32 bit values
        switch (attribute.data_type()) {
            case 1: case 11: // DT_INT8 or DT_BOOL
                attributeData = new draco.DracoInt8Array();
                vertexArray = new Int8Array(vertexArrayLength);
                dracoDecoder.GetAttributeInt8ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case 2: // DT_UINT8
                attributeData = new draco.DracoUInt8Array();
                vertexArray = new Uint8Array(vertexArrayLength);
                dracoDecoder.GetAttributeUInt8ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case 3: // DT_INT16
                attributeData = new draco.DracoInt16Array();
                vertexArray = new Int16Array(vertexArrayLength);
                dracoDecoder.GetAttributeInt16ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case 4: // DT_UINT16
                attributeData = new draco.DracoUInt16Array();
                vertexArray = new Uint16Array(vertexArrayLength);
                dracoDecoder.GetAttributeUInt16ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case 5: case 7: // DT_INT32 or DT_INT64
                attributeData = new draco.DracoInt32Array();
                vertexArray = new Int32Array(vertexArrayLength);
                dracoDecoder.GetAttributeInt32ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case 6: case 8: // DT_UINT32 or DT_UINT64
                attributeData = new draco.DracoUInt32Array();
                vertexArray = new Uint32Array(vertexArrayLength);
                dracoDecoder.GetAttributeUInt32ForAllPoints(dracoGeometry, attribute, attributeData);
                break;
            case 9: case 10: // DT_FLOAT32 or DT_FLOAT64
                attributeData = new draco.DracoFloat32Array();
                vertexArray = new Float32Array(vertexArrayLength);
                dracoDecoder.GetAttributeFloatForAllPoints(dracoGeometry, attribute, attributeData);
                break;
        }

        for (var i = 0; i < vertexArrayLength; ++i) {
            vertexArray[i] = attributeData.GetValue(i);
        }

        draco.destroy(attributeData);
        return vertexArray;
    }

    function decodeAttributeData(dracoGeometry, compressedAttributes) {
        var numPoints = dracoGeometry.num_points();
        var decodedAttributeData = {};
        var vertexArray;
        var quantization;
        for (var attributeName in compressedAttributes) {
            if (compressedAttributes.hasOwnProperty(attributeName)) {
                var compressedAttribute = compressedAttributes[attributeName];
                var attribute = dracoDecoder.GetAttributeByUniqueId(dracoGeometry, compressedAttribute);
                var numComponents = attribute.num_components();

                var i;
                var transform = new draco.AttributeQuantizationTransform();
                if (transform.InitFromAttribute(attribute)) {
                    var minValues = new Array(numComponents);
                    for (i = 0; i < numComponents; ++i) {
                        minValues[i] = transform.min_value(i);
                    }

                    quantization = {
                        quantizationBits : transform.quantization_bits(),
                        minValues : minValues,
                        range : transform.range()
                    };
                }
                draco.destroy(transform);

                transform = new draco.AttributeOctahedronTransform();
                if (transform.InitFromAttribute(attribute)) {
                    quantization = {
                        quantizationBits : transform.quantization_bits()
                    };
                }
                draco.destroy(transform);

                var vertexArrayLength = numPoints * numComponents;
                if (defined(quantization)) {
                    vertexArray = decodeQuantizedDracoTypedArray(dracoGeometry, attribute, quantization, vertexArrayLength);
                } else {
                    vertexArray = decodeDracoTypedArray(dracoGeometry, attribute, vertexArrayLength);
                }

                var componentDatatype = ComponentDatatype.fromTypedArray(vertexArray);
                decodedAttributeData[attributeName] = {
                    array : vertexArray,
                    data : {
                        componentsPerAttribute : numComponents,
                        componentDatatype : componentDatatype,
                        byteOffset : attribute.byte_offset(),
                        byteStride : ComponentDatatype.getSizeInBytes(componentDatatype) * numComponents,
                        normalized : attribute.normalized(),
                        quantization : quantization
                    }
                };

                quantization = undefined;
            }
        }

        return decodedAttributeData;
    }

    function decodeDracoPrimitive(parameters) {
        // Skip all paramter types except generic
        var attributesToSkip = ['POSITION', 'NORMAL', 'COLOR', 'TEX_COORD'];
        if (parameters.dequantizeInShader) {
            for (var i = 0; i < attributesToSkip.length; ++i) {
                dracoDecoder.SkipAttributeTransform(draco[attributesToSkip[i]]);
            }
        }

        var bufferView = parameters.bufferView;
        var buffer = new draco.DecoderBuffer();
        buffer.Init(parameters.array, bufferView.byteLength);

        var geometryType = dracoDecoder.GetEncodedGeometryType(buffer);
        if (geometryType !== draco.TRIANGULAR_MESH) {
            throw new RuntimeError('Unsupported draco mesh geometry type.');
        }

        var dracoGeometry = new draco.Mesh();
        var decodingStatus = dracoDecoder.DecodeBufferToMesh(buffer, dracoGeometry);
        if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
            throw new RuntimeError('Error decoding draco mesh geometry: ' + decodingStatus.error_msg());
        }

        draco.destroy(buffer);

        var result = {
            indexArray : decodeIndexArray(dracoGeometry),
            attributeData : decodeAttributeData(dracoGeometry, parameters.compressedAttributes)
        };

        draco.destroy(dracoGeometry);

        return result;
    }

    function initWorker(dracoModule) {
        draco = dracoModule;
        dracoDecoder = new draco.Decoder();
        self.onmessage = createTaskProcessorWorker(decodeDracoPrimitive);
        self.postMessage(true);
    }

    function decodeDraco(event) {
        var data = event.data;

        // Expect the first message to be to load a web assembly module
        var wasmConfig = data.webAssemblyConfig;
        if (defined(wasmConfig)) {
            // Require and compile WebAssembly module, or use fallback if not supported
            return require([wasmConfig.modulePath], function(dracoModule) {
                if (defined(wasmConfig.wasmBinaryFile)) {
                    if (!defined(dracoModule)) {
                        dracoModule = self.DracoDecoderModule;
                    }

                    dracoModule(wasmConfig).then(function (compiledModule) {
                        initWorker(compiledModule);
                    });
                } else {
                    initWorker(dracoModule());
                }
            });
        }
    }

    return decodeDraco;
});
